// Servidor que lê a página de alagamentos do CGE e devolve JSON para o front-end.
// Rodar:  npm install   e depois   node server.js
// Abrir:  http://localhost:3000

const express = require("express");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const PORTA = process.env.PORT || 3000;
const URL_CGE = "https://www.cgesp.org/v3/alagamentos.jsp";
const CACHE_MIN = 2;                       // não consulta o CGE mais que 1x a cada 2 min
const ARQ_GEOCACHE = path.join(__dirname, "geocache.json");
const ARQ_DEBUG = path.join(__dirname, "ultima-pagina-cge.html");

const app = express();

// Libera o acesso para o front-end mesmo se aberto por outro endereço
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// Serve o front-end (pasta acima desta)
app.use(express.static(path.join(__dirname, "..")));

// ===================== Buscar a página do CGE =====================
function hojeBR() {
  return new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

async function baixarPagina(data) {
  const url = `${URL_CGE}?dataBusca=${encodeURIComponent(data)}&enviaBusca=Buscar`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (painel alagamentos SP)" }
  });
  if (!resp.ok) throw new Error(`CGE respondeu ${resp.status}`);

  // A página pode vir em ISO-8859-1; decodifica pelo charset informado
  const buffer = await resp.arrayBuffer();
  const tipo = resp.headers.get("content-type") || "";
  const charset = (tipo.match(/charset=([^;]+)/i) || [])[1] || "utf-8";
  let html = new TextDecoder(charset.trim()).decode(buffer);
  if (html.includes("\uFFFD")) html = new TextDecoder("iso-8859-1").decode(buffer);

  fs.writeFileSync(ARQ_DEBUG, html); // guarda a última página para conferir a estrutura
  return html;
}

// ===================== Extrair os pontos =====================
const limpar = t => (t || "").replace(/\s+/g, " ").trim();

function extrairPontos(html) {
  const $ = cheerio.load(html);
  const pontos = [];

  $(".ponto-de-alagamento").each((_, el) => {
    const ponto = $(el);

    // Bairro/região: cabeçalho da tabela onde o ponto está
    const tabela = ponto.closest("table");
    const bairro = limpar(tabela.find(".bairro").first().text());

    // Situação: vem na classe de um elemento, ex. "ativo-intransitavel"
    const htmlPonto = $.html(ponto);
    const sit = htmlPonto.match(/(ativo|inativo)-(transitavel|intransitavel)/i);

    // Linhas de texto do ponto
    let linhas = ponto.find(".arial-descr-alag").map((_, l) => limpar($(l).text())).get();
    if (!linhas.length) linhas = ponto.text().split("\n").map(limpar);
    linhas = linhas.filter(Boolean);

    const info = { bairro, rua: "", sentido: "", referencia: "", inicio: "", fim: "" };
    linhas.forEach(l => {
      const horario = l.match(/De\s*(\d{1,2}:\d{2})\s*a\s*(\d{1,2}:\d{2})?/i);
      if (horario) { info.inicio = horario[1]; info.fim = horario[2] || ""; return; }
      if (/^sentido/i.test(l)) { info.sentido = l.replace(/^sentido:?/i, "").trim(); return; }
      if (/^refer/i.test(l)) { info.referencia = l.replace(/^refer[eê]ncia:?/i, "").trim(); return; }
      if (!info.rua) info.rua = l;
    });

    if (!info.rua) return;
    pontos.push({
      ...info,
      ativo: sit ? sit[1].toLowerCase() === "ativo" : null,
      transitavel: sit ? sit[2].toLowerCase() === "transitavel" : null
    });
  });

  return pontos;
}

// ===================== Nomes de rua por extenso =====================
// O CGE escreve "AV MARQ DE SAO VICENTE"; aqui vira "Avenida Marquês de São Vicente"
const ABREVIACOES = {
  AV: "Avenida", R: "Rua", PC: "Praça", PCA: "Praça", VD: "Viaduto", PTE: "Ponte",
  EST: "Estrada", AL: "Alameda", TV: "Travessa", LGO: "Largo", TUN: "Túnel", ROD: "Rodovia",
  MARG: "Marginal", MARQ: "Marquês", MAL: "Marechal", DR: "Doutor", DRA: "Doutora",
  PROF: "Professor", PROFA: "Professora", ENG: "Engenheiro", GAL: "General", GEN: "General",
  CEL: "Coronel", CAP: "Capitão", TEN: "Tenente", SGT: "Sargento", BRIG: "Brigadeiro",
  ALM: "Almirante", PRES: "Presidente", GOV: "Governador", DEP: "Deputado", SEN: "Senador",
  VER: "Vereador", STA: "Santa", STO: "Santo", S: "São", PE: "Padre", FR: "Frei",
  D: "Dom", CONS: "Conselheiro", COM: "Comendador", DES: "Desembargador", VISC: "Visconde",
  BR: "Barão", BAR: "Barão", COND: "Conde", JD: "Jardim", VL: "Vila", PQ: "Parque", N: "Nossa"
};
const PALAVRAS = {
  SAO: "São", JOAO: "João", JOSE: "José", CONCEICAO: "Conceição", ANTONIO: "Antônio",
  ESTACAO: "Estação", LIBERDADE: "Liberdade", ASSUNCAO: "Assunção", PAULISTA: "Paulista",
  TIETE: "Tietê", MOOCA: "Mooca", ITAQUERA: "Itaquera", JACANA: "Jaçanã", BRAS: "Brás",
  PEREIRA: "Pereira", INDIO: "Índio", MARCAL: "Marçal", VICENCIA: "Vicência"
};
const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e"]);

function porExtenso(texto) {
  if (!texto) return "";
  return texto.trim().split(/\s+/).map((pedaco, i) => {
    // separa parênteses, ex. "(BRAS)" -> "(", "BRAS", ")"
    const [, antes, p, depois] = pedaco.match(/^([(]*)(.*?)([)]*)$/);
    const limpo = p.replace(/[.,]/g, "").toUpperCase();
    let r;
    if (ABREVIACOES[limpo] && (i === 0 || limpo.length > 1)) r = ABREVIACOES[limpo];
    else if (PALAVRAS[limpo]) r = PALAVRAS[limpo];
    else if (i > 0 && MINUSCULAS.has(p.toLowerCase())) r = p.toLowerCase();
    else if (/^\d/.test(p)) r = p;
    else r = (p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .replace(/\/(\p{L})/gu, (_, c) => "/" + c.toUpperCase());
    return antes + r + depois;
  }).join(" ");
}

// ===================== Coordenadas (Nominatim/OpenStreetMap) =====================
let geocache = {};
try { geocache = JSON.parse(fs.readFileSync(ARQ_GEOCACHE, "utf8")); } catch { geocache = {}; }

const fila = [];
let processandoFila = false;
const chaveGeo = p => `${p.rua}|${p.bairro}`.toLowerCase();

function pedirCoordenadas(p) {
  const chave = chaveGeo(p);
  if (chave in geocache || fila.some(x => chaveGeo(x) === chave)) return;
  fila.push(p);
  processarFila();
}

// O Nominatim aceita no máximo 1 consulta por segundo
async function processarFila() {
  if (processandoFila) return;
  processandoFila = true;
  while (fila.length) {
    const p = fila.shift();
    // Tenta com o bairro; se não achar, tenta só com a rua
    const rua = porExtenso(p.rua);
    const tentativas = [`${rua}, ${porExtenso(p.bairro)}, São Paulo`, `${rua}, São Paulo`];
    let achou = null;
    try {
      for (const q of tentativas) {
        const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br"
          + "&viewbox=-46.83,-23.36,-46.36,-24.01&bounded=1&q=" + encodeURIComponent(q);
        const r = await fetch(url, { headers: { "User-Agent": "painel-alagamentos-sp/1.0" } });
        const j = await r.json();
        await new Promise(r => setTimeout(r, 1100));
        if (j[0]) { achou = { lat: +j[0].lat, lon: +j[0].lon }; break; }
      }
      geocache[chaveGeo(p)] = achou;
      fs.writeFileSync(ARQ_GEOCACHE, JSON.stringify(geocache, null, 2));
      if (!achou) console.warn("Rua não encontrada no mapa:", rua);
    } catch (e) {
      console.warn("Falha ao localizar:", rua, e.message);
      await new Promise(r => setTimeout(r, 1100));
    }
  }
  processandoFila = false;
}

// ===================== Mapa base (OpenStreetMap com cache local) =====================
// O OpenStreetMap bloqueia pedidos sem identificação. Aqui o servidor pede cada
// pedaço do mapa se identificando e guarda uma cópia em tiles-cache/ por 7 dias.
const PASTA_TILES = path.join(__dirname, "tiles-cache");
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

// ===================== API =====================
const cache = {}; // por data

app.get("/api/alagamentos", async (req, res) => {
  const data = req.query.data || hojeBR();
  const agora = Date.now();

  try {
    if (!cache[data] || agora - cache[data].quando > CACHE_MIN * 60 * 1000) {
      const html = await baixarPagina(data);
      cache[data] = { quando: agora, pontos: extrairPontos(html) };
    }

    const pontos = cache[data].pontos.map(p => {
      const geo = geocache[chaveGeo(p)];
      if (geo === undefined) pedirCoordenadas(p); // localiza em segundo plano
      return {
        ...p,
        rua: porExtenso(p.rua),
        bairro: porExtenso(p.bairro),
        sentido: porExtenso(p.sentido),
        referencia: porExtenso(p.referencia),
        ruaOriginal: p.rua,
        lat: geo ? geo.lat : null,
        lon: geo ? geo.lon : null
      };
    });

    res.json({
      data,
      consultadoEm: new Date(cache[data].quando).toISOString(),
      total: pontos.length,
      ativos: pontos.filter(p => p.ativo).length,
      pontos,
      aviso: pontos.length === 0
        ? "Nenhum ponto encontrado. Pode não haver alagamento hoje, ou a página do CGE mudou (veja ultima-pagina-cge.html)."
        : undefined
    });
  } catch (e) {
    console.error(e);
    res.status(502).json({ erro: "Não foi possível ler o site do CGE.", detalhe: e.message });
  }
});

app.listen(PORTA, () => {
  console.log(`Painel em http://localhost:${PORTA}`);
  console.log(`API em    http://localhost:${PORTA}/api/alagamentos`);
});