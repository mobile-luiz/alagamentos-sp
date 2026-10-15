// Leitura da página de alagamentos do CGE (cgesp.org) e tratamento dos nomes de rua.
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const URL_CGE = "https://www.cgesp.org/v3/alagamentos.jsp";
const ARQ_DEBUG = path.join(__dirname, "ultima-pagina-cge.html");

// Datas: o CGE usa DD/MM/AAAA; o banco usa AAAA-MM-DD
const hojeISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const isoParaBR = iso => iso.split("-").reverse().join("/");
const brParaISO = br => br.split("/").reverse().join("-");

async function baixarPagina(dataBR) {
  const url = `${URL_CGE}?dataBusca=${encodeURIComponent(dataBR)}&enviaBusca=Buscar`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (painel alagamentos SP)" },
    signal: AbortSignal.timeout(20000)
  });
  if (!resp.ok) throw new Error(`CGE respondeu ${resp.status}`);

  // A página pode vir em ISO-8859-1; decodifica pelo charset informado
  const buffer = await resp.arrayBuffer();
  const tipo = resp.headers.get("content-type") || "";
  const charset = (tipo.match(/charset=([^;]+)/i) || [])[1] || "utf-8";
  let html = new TextDecoder(charset.trim()).decode(buffer);
  if (html.includes("\uFFFD")) html = new TextDecoder("iso-8859-1").decode(buffer);

  try { fs.writeFileSync(ARQ_DEBUG, html); } catch { /* sem permissão de escrita: tudo bem */ }
  return html;
}

const limpar = t => (t || "").replace(/\s+/g, " ").trim();

function extrairPontos(html) {
  const $ = cheerio.load(html);
  const pontos = [];

  $(".ponto-de-alagamento").each((_, el) => {
    const ponto = $(el);
    const bairro = limpar(ponto.closest("table").find(".bairro").first().text());

    // Situação: vem na classe de um elemento, ex. "ativo-intransitavel"
    const sit = $.html(ponto).match(/(ativo|inativo)-(transitavel|intransitavel)/i);

    let linhas = ponto.find(".arial-descr-alag").map((_, l) => limpar($(l).text())).get();
    if (!linhas.length) linhas = ponto.text().split("\n").map(limpar);
    linhas = linhas.filter(Boolean);

    const info = { bairro, rua: "", sentido: "", referencia: "", inicio: "", fim: "" };
    linhas.forEach(l => {
      const horario = l.match(/De\s*(\d{1,2}:\d{2})\s*a\s*(\d{1,2}:\d{2})?/i);
      if (horario) { info.inicio = horario[1].padStart(5, "0"); info.fim = horario[2] || ""; return; }
      if (/^sentido/i.test(l)) { info.sentido = l.replace(/^sentido:?/i, "").trim(); return; }
      if (/^refer/i.test(l)) { info.referencia = l.replace(/^refer[eê]ncia:?/i, "").trim(); return; }
      if (!info.rua) info.rua = l;
    });

    if (!info.rua) return;
    pontos.push({
      bairro: porExtenso(info.bairro),
      rua: porExtenso(info.rua),
      sentido: porExtenso(info.sentido),
      referencia: porExtenso(info.referencia),
      inicio: info.inicio,
      fim: info.fim,
      ativo: sit ? sit[1].toLowerCase() === "ativo" : !info.fim,
      transitavel: sit ? sit[2].toLowerCase() === "transitavel" : null
    });
  });

  return pontos;
}

// Busca e extrai os pontos de um dia (data em AAAA-MM-DD)
async function pontosDoDia(dataISO) {
  const html = await baixarPagina(isoParaBR(dataISO));
  return extrairPontos(html);
}

// Identificador estável de uma ocorrência (mesma rua, sentido e horário de início no mesmo dia)
const idOcorrencia = (dataISO, p) =>
  [dataISO, p.rua, p.sentido, p.inicio].join("|").toLowerCase();

// ===================== Nomes de rua por extenso =====================
// "AV MARQ DE SAO VICENTE" vira "Avenida Marquês de São Vicente"
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
  ESTACAO: "Estação", ASSUNCAO: "Assunção", TIETE: "Tietê", JACANA: "Jaçanã", BRAS: "Brás",
  INDIO: "Índio", MARCAL: "Marçal", VICENCIA: "Vicência", AGUA: "Água", LAPA: "Lapa"
};
const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e"]);

function porExtenso(texto) {
  if (!texto) return "";
  return texto.trim().split(/\s+/).map((pedaco, i) => {
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

module.exports = { pontosDoDia, extrairPontos, porExtenso, idOcorrencia, hojeISO, isoParaBR, brParaISO };
