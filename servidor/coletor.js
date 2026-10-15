// Coleta automática: consulta o CGE a cada poucos minutos, guarda no banco
// e manda os avisos. Também importa os dias passados para montar o histórico.
const cge = require("./cge");
const banco = require("./banco");
const push = require("./push");
const { coordenadas } = require("./geo");

const INTERVALO_MIN = Number(process.env.COLETA_MIN || 3);
const DIAS_HISTORICO = Number(process.env.HISTORICO_DIAS || 90);
const PAUSA_IMPORTACAO_MS = 2500; // respeito ao site do CGE: 1 dia a cada 2,5 s

let hoje = { quando: 0, pontos: [] };
let importando = false;
const esperar = ms => new Promise(r => setTimeout(r, ms));

const comCoordenadas = p => {
  const c = coordenadas(p);
  return { ...p, lat: c ? c.lat : null, lon: c ? c.lon : null };
};

// Busca o dia de hoje (com cache curto) e salva no banco
async function coletarHoje(forcar = false) {
  if (!forcar && Date.now() - hoje.quando < 2 * 60 * 1000) return hoje;
  const data = cge.hojeISO();
  const pontos = await cge.pontosDoDia(data);
  banco.salvarDia(data, pontos, false);
  hoje = { quando: Date.now(), data, pontos };

  const ativos = pontos.filter(p => p.ativo).map(comCoordenadas);
  push.avisarNovos(ativos, p => cge.idOcorrencia(data, p)).catch(e => console.warn("Avisos:", e.message));
  return hoje;
}

// Pontos de qualquer dia: hoje vem do CGE; dias passados vêm do banco quando já estão completos
async function pontosDe(dataISO) {
  if (dataISO === cge.hojeISO()) {
    const h = await coletarHoje();
    return { pontos: h.pontos.map(comCoordenadas), consultadoEm: new Date(h.quando).toISOString() };
  }
  if (!banco.diaCompleto(dataISO)) {
    const pontos = await cge.pontosDoDia(dataISO);
    banco.salvarDia(dataISO, pontos, true);
  }
  return { pontos: banco.pontosDoBanco(dataISO).map(comCoordenadas), consultadoEm: new Date().toISOString() };
}

// Importa os dias que ainda não estão no banco, do mais recente para o mais antigo
async function importarPassado(dias = DIAS_HISTORICO) {
  if (importando) return;
  importando = true;
  let novos = 0;
  try {
    for (let i = 1; i <= dias; i++) {
      const data = new Date(Date.now() - i * 864e5).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      if (banco.diaCompleto(data)) continue;
      try {
        const pontos = await cge.pontosDoDia(data);
        banco.salvarDia(data, pontos, true);
        novos++;
        if (novos % 10 === 0) console.log(`Histórico: ${novos} dias importados (até ${data})`);
      } catch (e) {
        console.warn(`Histórico: falha em ${data}:`, e.message);
      }
      await esperar(PAUSA_IMPORTACAO_MS);
    }
    if (novos) console.log(`Histórico atualizado: ${novos} dia(s) novo(s).`);
  } finally {
    importando = false;
  }
}

function iniciar() {
  const rodar = () => coletarHoje(true).catch(e => console.warn("Coleta do CGE:", e.message));
  rodar();
  setInterval(rodar, INTERVALO_MIN * 60 * 1000);

  // Histórico: começa 10 s depois de ligar e confere de novo a cada hora (pega o dia que virou)
  setTimeout(() => importarPassado().catch(e => console.warn(e.message)), 10000);
  setInterval(() => importarPassado(3).catch(e => console.warn(e.message)), 60 * 60 * 1000);
}

const estaImportando = () => importando;

module.exports = { iniciar, pontosDe, importarPassado, estaImportando, comCoordenadas };
