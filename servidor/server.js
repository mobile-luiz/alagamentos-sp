// Servidor do painel Chuva e Alagamentos SP.
// Rodar:  npm install   e depois   node server.js
// Abrir:  http://localhost:3000
const express = require("express");
const fs = require("fs");
const path = require("path");

const { PASTA_DADOS } = require("./geo");
const cge = require("./cge");
const banco = require("./banco");
const coletor = require("./coletor");
const push = require("./push");

const PORTA = process.env.PORT || 3000;
const app = express();
app.use(express.json({ limit: "20kb" }));

// Libera o acesso para a página hospedada em outro endereço (ex.: GitHub Pages)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// O service worker precisa ser sempre buscado de novo, senão o app não atualiza
app.get("/sw.js", (req, res, next) => { res.setHeader("Cache-Control", "no-cache"); next(); });

// Nunca entrega os arquivos do servidor (banco, chaves dos avisos, código)
app.use((req, res, next) => {
  if (/^\/(servidor|node_modules|\.git)(\/|$)/i.test(req.path)) return res.sendStatus(404);
  next();
});

// Serve a página (pasta acima desta)
app.use(express.static(path.join(__dirname, ".."), { index: "index.html" }));

// ===================== Alagamentos de um dia =====================
app.get("/api/alagamentos", async (req, res) => {
  try {
    const dataISO = req.query.data ? cge.brParaISO(String(req.query.data)) : cge.hojeISO();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return res.status(400).json({ erro: "Data inválida. Use DD/MM/AAAA." });

    const { pontos, consultadoEm } = await coletor.pontosDe(dataISO);
    res.json({
      data: cge.isoParaBR(dataISO),
      consultadoEm,
      total: pontos.length,
      ativos: pontos.filter(p => p.ativo).length,
      pontos
    });
  } catch (e) {
    console.error(e);
    res.status(502).json({ erro: "Não foi possível ler o site do CGE.", detalhe: e.message });
  }
});

// ===================== Histórico =====================
app.get("/api/historico", (req, res) => {
  const dias = Math.min(Math.max(parseInt(req.query.dias, 10) || 90, 7), 1095);
  const r = banco.resumo(dias);
  const ruas = r.ruas.map(coletor.comCoordenadas);
  res.json({
    ...r,
    importando: coletor.estaImportando(),
    ranking: ruas.slice(0, 15),
    // Para o mapa de calor: só as ruas já localizadas
    calor: ruas.filter(x => x.lat != null).map(x => [x.lat, x.lon, x.vezes]),
    ruas: undefined
  });
});

// ===================== Avisos no celular =====================
app.get("/api/push/chave", (req, res) => res.json({ chave: push.chavePublica() }));

app.post("/api/push/inscrever", (req, res) => {
  const { inscricao, lat, lon, raioKm } = req.body || {};
  if (!inscricao || !inscricao.endpoint) return res.status(400).json({ erro: "Inscrição inválida." });
  banco.inscrever(inscricao, lat, lon, raioKm);
  res.json({ ok: true });
});

app.post("/api/push/cancelar", (req, res) => {
  if (req.body?.endpoint) banco.cancelarInscricao(req.body.endpoint);
  res.json({ ok: true });
});

app.post("/api/push/teste", async (req, res) => {
  const insc = req.body?.endpoint && banco.buscarInscricao(req.body.endpoint);
  if (!insc) return res.status(404).json({ erro: "Avisos não estão ativos neste aparelho." });
  const ok = await push.enviar(insc, {
    title: "Avisos ativados",
    body: "Você vai receber um aviso quando uma rua alagar.",
    tag: "teste",
    url: "./"
  });
  res.json({ ok });
});

// ===================== Saúde (usado pelo Render) =====================
app.get("/api/status", (req, res) => res.json({ ok: true, importandoHistorico: coletor.estaImportando() }));

// ===================== Mapa base (OpenStreetMap com cache local) =====================
// O OpenStreetMap bloqueia pedidos sem identificação. Aqui o servidor pede cada
// pedaço do mapa se identificando e guarda uma cópia em tiles-cache/ por 7 dias.
const PASTA_TILES = path.join(PASTA_DADOS, "tiles-cache");
const TILE_DIAS = 7;

app.get("/tiles/:z/:x/:y.png", async (req, res) => {
  const { z, x, y } = req.params;
  if (![z, x, y].every(v => /^\d+$/.test(v)) || +z > 19) return res.status(400).end();

  const arquivo = path.join(PASTA_TILES, z, x, `${y}.png`);
  try {
    const info = fs.statSync(arquivo);
    if (Date.now() - info.mtimeMs < TILE_DIAS * 864e5) {
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.type("png").sendFile(arquivo);
    }
  } catch { /* ainda não tem no cache */ }

  try {
    const r = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, {
      headers: {
        "User-Agent": "painel-alagamentos-sp/1.0 (uso pessoal)",
        "Referer": "http://localhost/"
      }
    });
    if (!r.ok) throw new Error(`OSM respondeu ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(arquivo, buf);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.type("png").send(buf);
  } catch (e) {
    console.warn("Mapa:", e.message);
    res.status(502).end();
  }
});


app.listen(PORTA, () => {
  console.log(`Painel em http://localhost:${PORTA}`);
  coletor.iniciar();
});
