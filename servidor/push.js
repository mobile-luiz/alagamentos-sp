// Avisos no celular (Web Push). Funciona com o app aberto ou fechado.
// As chaves VAPID identificam o seu servidor. Em produção, coloque-as nas variáveis
// de ambiente VAPID_PUBLIC e VAPID_PRIVATE (gere com: node gerar-chaves.js).
const webpush = require("web-push");
const fs = require("fs");
const path = require("path");
const banco = require("./banco");
const { distanciaKm, PASTA_DADOS } = require("./geo");

const ARQ_CHAVES = path.join(PASTA_DADOS, "vapid.json");

function carregarChaves() {
  if (process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE) {
    return { publicKey: process.env.VAPID_PUBLIC, privateKey: process.env.VAPID_PRIVATE };
  }
  try { return JSON.parse(fs.readFileSync(ARQ_CHAVES, "utf8")); } catch { /* cria abaixo */ }
  const novas = webpush.generateVAPIDKeys();
  fs.writeFileSync(ARQ_CHAVES, JSON.stringify(novas, null, 2));
  console.log("Chaves de aviso criadas em", ARQ_CHAVES);
  return novas;
}

const chaves = carregarChaves();
webpush.setVapidDetails(
  process.env.VAPID_EMAIL || "mailto:avisos@alagamentos-sp.local",
  chaves.publicKey,
  chaves.privateKey
);

const chavePublica = () => chaves.publicKey;

async function enviar(inscricao, conteudo) {
  try {
    await webpush.sendNotification(JSON.parse(inscricao.dados), JSON.stringify(conteudo), { TTL: 3600 });
    return true;
  } catch (e) {
    // 404/410: o celular cancelou ou o app foi desinstalado
    if (e.statusCode === 404 || e.statusCode === 410) banco.cancelarInscricao(inscricao.endpoint);
    else console.warn("Aviso não enviado:", e.statusCode || e.message);
    return false;
  }
}

// Recebe os pontos ativos (com lat/lon quando já localizados) e avisa quem ainda não foi avisado
async function avisarNovos(pontosAtivos, idDe) {
  const lista = banco.inscricoes();
  if (!lista.length) return;

  for (const p of pontosAtivos) {
    const id = idDe(p);
    for (const insc of lista) {
      const chave = `${id}|${insc.endpoint}`;
      if (banco.jaAvisado(chave)) continue;

      // Inscrição com raio: só avisa se a rua já foi localizada e está perto
      if (insc.raio_km && insc.lat != null) {
        if (p.lat == null) continue; // tenta de novo na próxima rodada
        if (distanciaKm({ lat: insc.lat, lon: insc.lon }, p) > insc.raio_km) {
          banco.marcarAvisado(chave);
          continue;
        }
      }

      const situacao = p.transitavel === false ? "Intransitável" : "Alagada, mas dá para passar";
      await enviar(insc, {
        title: `Rua alagada: ${p.rua}`,
        body: `${situacao} desde ${p.inicio || "agora"}. ${p.bairro}${p.referencia ? `, ${p.referencia}` : ""}.`,
        tag: id,
        url: "./?aba=ruas"
      });
      banco.marcarAvisado(chave);
    }
  }
}

module.exports = { chavePublica, enviar, avisarNovos };
