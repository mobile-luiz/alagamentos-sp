// Encontra as coordenadas de cada rua no OpenStreetMap (Nominatim) e guarda em cache.
// O Nominatim aceita no máximo 1 consulta por segundo, então tudo passa por uma fila.
const fs = require("fs");
const path = require("path");

const PASTA_DADOS = process.env.PASTA_DADOS || path.join(__dirname, "dados");
fs.mkdirSync(PASTA_DADOS, { recursive: true });
const ARQ_CACHE = path.join(PASTA_DADOS, "geocache.json");

let cache = {};
try { cache = JSON.parse(fs.readFileSync(ARQ_CACHE, "utf8")); } catch { cache = {}; }

const chave = p => `${p.rua}|${p.bairro}`.toLowerCase();
const fila = [];
let rodando = false;

// Devolve {lat, lon}, null (não achou) ou undefined (ainda não procurou — entra na fila)
function coordenadas(p) {
  const c = cache[chave(p)];
  if (c === undefined) pedir(p);
  return c;
}

function pedir(p) {
  const k = chave(p);
  if (k in cache || fila.some(x => chave(x) === k)) return;
  fila.push(p);
  processar();
}

const esperar = ms => new Promise(r => setTimeout(r, ms));

async function processar() {
  if (rodando) return;
  rodando = true;
  while (fila.length) {
    const p = fila.shift();
    const tentativas = [`${p.rua}, ${p.bairro}, São Paulo`, `${p.rua}, São Paulo`];
    let achou = null;
    try {
      for (const q of tentativas) {
        const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br"
          + "&viewbox=-46.83,-23.36,-46.36,-24.01&bounded=1&q=" + encodeURIComponent(q);
        const r = await fetch(url, {
          headers: { "User-Agent": "painel-alagamentos-sp/2.0" },
          signal: AbortSignal.timeout(15000)
        });
        const j = await r.json();
        await esperar(1100);
        if (j[0]) { achou = { lat: +j[0].lat, lon: +j[0].lon }; break; }
      }
      cache[chave(p)] = achou;
      fs.writeFileSync(ARQ_CACHE, JSON.stringify(cache));
    } catch (e) {
      console.warn("Falha ao localizar:", p.rua, e.message);
      await esperar(1100);
    }
  }
  rodando = false;
}

// Distância em km entre dois pontos
function distanciaKm(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

module.exports = { coordenadas, distanciaKm, PASTA_DADOS };
