// ===================== Configuração =====================
const ATUALIZAR_A_CADA_MIN = 3;
const RADAR_A_CADA_MIN = 10;
const HORAS_PASSADAS = 6;
const HORAS_FUTURAS = 6;

// Endereço do servidor: config.js > mesma origem > localhost (página aberta como arquivo)
const BASE_SERVIDOR = (window.CONFIG && window.CONFIG.API_BASE)
  || (location.protocol.startsWith("http") ? "" : "http://localhost:3000");
const api = caminho => BASE_SERVIDOR.replace(/\/$/, "") + caminho;

const $ = id => document.getElementById(id);
const ehCelular = () => window.matchMedia("(max-width: 820px)").matches;
const mm = v => `${v.toFixed(1).replace(".", ",")} mm`;
const numero = v => Number(v || 0).toLocaleString("pt-BR");

function escapar(t) {
  const d = document.createElement("div");
  d.textContent = t ?? "";
  return d.innerHTML;
}

// ===================== Tema (automático, claro, escuro) =====================
const TEMAS = ["auto", "claro", "escuro"];
const NOMES_TEMA = { auto: "automático", claro: "claro", escuro: "escuro" };
let tema = "auto";
try { tema = localStorage.getItem("alagamentos-sp:tema") || "auto"; } catch { /* sem storage */ }

const temaEscuroAtivo = () =>
  tema === "escuro" || (tema === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);

function aplicarTema(novo) {
  tema = novo;
  if (novo === "auto") delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = novo;
  try { localStorage.setItem("alagamentos-sp:tema", novo); } catch { /* ok */ }
  const rotulo = `Tema: ${NOMES_TEMA[novo]}`;
  $("btnTema").setAttribute("aria-label", rotulo);
  $("btnTema").title = rotulo;
  $("btnTema").dataset.tema = novo;
  // Ícone: meio círculo (automático), sol (claro), lua (escuro)
  $("btnTema").querySelector("svg").innerHTML = {
    auto: '<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
    claro: '<circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    escuro: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="currentColor"/>'
  }[novo];
  // Se a pessoa não escolheu o mapa à mão, acompanha o tema
  if (!fundoEscolhidoAMao) trocarFundo(temaEscuroAtivo() ? "Mapa escuro" : "Mapa", false);
}
$("btnTema").addEventListener("click", () => aplicarTema(TEMAS[(TEMAS.indexOf(tema) + 1) % TEMAS.length]));
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => aplicarTema(tema));

// ===================== Mapa =====================
const mapa = L.map("mapa", { zoomControl: true }).setView([-23.60, -46.62], 10);

// Camada própria para o radar: acima do mapa, abaixo dos marcadores
mapa.createPane("radar");
mapa.getPane("radar").style.zIndex = 350;
mapa.getPane("radar").style.pointerEvents = "none";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const CREDITO = ' | Chuva: <a href="https://open-meteo.com/">Open-Meteo</a>';

const mapasDeFundo = {
  "Mapa": L.tileLayer(`${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`, {
    maxZoom: 19, attribution: "Mapa &copy; Esri" + CREDITO
  }),
  "Mapa escuro": L.layerGroup([
    L.tileLayer(`${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
      maxZoom: 16, attribution: "Mapa &copy; Esri" + CREDITO
    }),
    L.tileLayer(`${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16 })
  ]),
  "OpenStreetMap": L.tileLayer(api("/tiles/{z}/{x}/{y}.png"), {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' + CREDITO
  }),
  "Satélite": L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, {
    maxZoom: 19, attribution: "Imagens &copy; Esri, Maxar, Earthstar Geographics" + CREDITO
  }),
  "Satélite com nomes": L.layerGroup([
    L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, {
      maxZoom: 19, attribution: "Imagens &copy; Esri, Maxar, Earthstar Geographics" + CREDITO
    }),
    L.tileLayer(`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19 }),
    L.tileLayer(`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19 })
  ]),
  "Relevo": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    maxZoom: 17, subdomains: "abc",
    attribution: 'Relevo &copy; <a href="https://opentopomap.org">OpenTopoMap</a>' + CREDITO
  })
};

let fundoAtual = null;
let fundoEscolhidoAMao = false;

function trocarFundo(nome, aMao = true) {
  const camada = mapasDeFundo[nome];
  if (aMao) fundoEscolhidoAMao = true;
  if (!camada || camada === fundoAtual) return;
  if (fundoAtual) mapa.removeLayer(fundoAtual);
  camada.addTo(mapa);
  fundoAtual = camada;
  document.querySelectorAll("#opcoesFundo button").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.fundo === nome)));
}

Object.keys(mapasDeFundo).forEach(nome => {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.fundo = nome;
  b.textContent = nome;
  b.setAttribute("aria-pressed", "false");
  b.addEventListener("click", () => trocarFundo(nome));
  $("opcoesFundo").appendChild(b);
});

// Se o mapa escolhido não carregar nada, troca sozinho para o próximo
const ordemReserva = ["Mapa", "OpenStreetMap", "Relevo", "Satélite"];
ordemReserva.forEach((nome, i) => {
  const camada = mapasDeFundo[nome];
  let erros = 0, ok = 0;
  camada.on("tileload", () => { ok++; });
  camada.on("tileerror", () => {
    erros++;
    if (ok === 0 && erros === 6 && fundoAtual === camada && ordemReserva[i + 1]) {
      trocarFundo(ordemReserva[i + 1], false);
    }
  });
});

const camadaZonas = L.layerGroup().addTo(mapa);
const camadaHistorico = L.layerGroup().addTo(mapa);
const camadaCge = L.layerGroup().addTo(mapa);
let camadaCalor = null;
const circulosPorZona = {};

aplicarTema(tema);

// ===================== Radar de chuva (RainViewer) =====================
// Plano grátis: últimas 2 horas, de 10 em 10 min, zoom máximo 7 (o Leaflet amplia acima disso).
const radar = { quadros: [], camadas: [], indice: 0, timer: null, ligado: true };

async function carregarRadar() {
  if (!radar.ligado) return;
  try {
    const r = await fetch("https://api.rainviewer.com/public/weather-maps.json");
    const j = await r.json();
    const quadros = (j.radar && j.radar.past) || [];
    if (!quadros.length) throw new Error("sem quadros");

    radar.camadas.forEach(c => mapa.removeLayer(c));
    radar.quadros = quadros;
    radar.camadas = quadros.map(q => L.tileLayer(`${j.host}${q.path}/256/{z}/{x}/{y}/2/1_1.png`, {
      pane: "radar",
      opacity: 0,
      maxNativeZoom: 7,
      maxZoom: 19,
      attribution: 'Radar &copy; <a href="https://www.rainviewer.com/">RainViewer</a>'
    }));
    if (radar.ligado) radar.camadas.forEach(c => c.addTo(mapa));

    $("radarLinha").max = quadros.length - 1;
    mostrarQuadro(quadros.length - 1);
    $("radar").hidden = !radar.ligado;
  } catch (e) {
    console.warn("Radar indisponível:", e.message);
    $("radar").hidden = true;
  }
}

function mostrarQuadro(i) {
  radar.indice = i;
  radar.camadas.forEach((c, n) => c.setOpacity(n === i ? 0.7 : 0));
  $("radarLinha").value = i;
  const q = radar.quadros[i];
  if (q) {
    const hora = new Date(q.time * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    $("radarHora").textContent = i === radar.quadros.length - 1 ? `${hora} (agora)` : hora;
  }
}

function animarRadar(tocar) {
  clearInterval(radar.timer);
  radar.timer = null;
  $("iconeRadar").setAttribute("d", tocar ? "M7 5h4v14H7zM13 5h4v14h-4z" : "M8 5v14l11-7z");
  $("btnRadarPlay").setAttribute("aria-label", tocar ? "Pausar radar" : "Animar radar");
  if (!tocar || !radar.quadros.length) return;
  let pausa = 0;
  radar.timer = setInterval(() => {
    const ultimo = radar.quadros.length - 1;
    // Segura um pouco no quadro mais recente antes de recomeçar
    if (radar.indice === ultimo && pausa < 3) { pausa++; return; }
    pausa = 0;
    mostrarQuadro((radar.indice + 1) % radar.quadros.length);
  }, 600);
}

$("btnRadarPlay").addEventListener("click", () => animarRadar(radar.timer === null));
$("radarLinha").addEventListener("input", e => { animarRadar(false); mostrarQuadro(+e.target.value); });

function ligarRadar(ligar) {
  radar.ligado = ligar;
  if (!ligar) {
    animarRadar(false);
    radar.camadas.forEach(c => mapa.removeLayer(c));
    $("radar").hidden = true;
  } else if (radar.camadas.length) {
    radar.camadas.forEach(c => c.addTo(mapa));
    mostrarQuadro(radar.quadros.length - 1);
    $("radar").hidden = false;
  } else {
    carregarRadar();
  }
}

// ===================== Chuva por região (Open-Meteo) =====================
async function buscarChuva() {
  const url = "https://api.open-meteo.com/v1/forecast"
    + `?latitude=${ZONAS.map(z => z.lat).join(",")}&longitude=${ZONAS.map(z => z.lon).join(",")}`
    + "&current=precipitation&hourly=precipitation,precipitation_probability"
    + `&past_hours=${HORAS_PASSADAS}&forecast_hours=${HORAS_FUTURAS + 1}`
    + "&timezone=America%2FSao_Paulo";
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Open-Meteo respondeu ${resp.status}`);
  const dados = await resp.json();
  return Array.isArray(dados) ? dados : [dados];
}

function resumir(dado) {
  const horas = dado.hourly.time;
  const chuva = dado.hourly.precipitation.map(v => v ?? 0);
  const prob = dado.hourly.precipitation_probability || [];
  let idx = 0;
  horas.forEach((h, i) => { if (h <= dado.current.time) idx = i; });
  const soma = (a, b) => chuva.slice(Math.max(a, 0), b + 1).reduce((s, v) => s + v, 0);
  return {
    ultimas3h: soma(idx - 2, idx),
    proximas3h: soma(idx + 1, idx + 3),
    probMax: Math.max(0, ...prob.slice(idx + 1, idx + 4).filter(v => v != null)),
    intensidade: (dado.current.precipitation ?? 0) * 4, // últimos 15 min x4 = mm/h aproximado
    serie: chuva,
    idxAgora: idx
  };
}

// Nível ESTIMADO (não é o critério oficial do CGE)
function calcularNivel(r) {
  const { ultimas3h: p3, intensidade: i, proximas3h: f3 } = r;
  if (p3 >= 50 || i >= 30) return 4;
  if (p3 >= 30 || i >= 15) return 3;
  if (p3 >= 10 || i >= 5 || f3 >= 15) return 2;
  if (p3 >= 0.5 || f3 >= 0.5) return 1;
  return 0;
}

let ultimoResultadoZonas = [];

function desenharZonas(resultados) {
  ultimoResultadoZonas = resultados;
  camadaZonas.clearLayers();
  const lista = $("listaZonas");
  lista.innerHTML = "";

  resultados.forEach(({ zona, resumo, nivel }) => {
    const cor = NIVEIS[nivel].cor;
    const circulo = L.circle([zona.lat, zona.lon], {
      radius: 3200, color: cor, weight: 2, fillColor: cor,
      fillOpacity: nivel === 0 ? 0.1 : 0.28
    }).bindPopup(`
      <strong>${zona.nome}</strong><br>
      ${NIVEIS[nivel].nome} (estimado)<br>
      Últimas 3h: ${mm(resumo.ultimas3h)}<br>
      Próximas 3h: ${mm(resumo.proximas3h)} (até ${resumo.probMax}% de chance)
    `).addTo(camadaZonas);
    circulosPorZona[zona.id] = circulo;

    const maior = Math.max(1, ...resumo.serie);
    const barras = resumo.serie.map((v, i) => {
      const classe = i > resumo.idxAgora ? "futuro" : (i === resumo.idxAgora ? "agora" : "");
      return `<span class="${classe}" style="height:${Math.max(4, (v / maior) * 100)}%" title="${mm(v)}"></span>`;
    }).join("");

    const li = document.createElement("li");
    li.className = "zona";
    li.tabIndex = 0;
    li.innerHTML = `
      <span class="zona-faixa" style="background:${cor}"></span>
      <span class="zona-nome">${zona.nome}</span>
      <span class="zona-nivel" style="color:${nivel === 2 ? "inherit" : cor}">${NIVEIS[nivel].nome}</span>
      <span class="zona-numeros">${mm(resumo.ultimas3h)} nas últimas 3h, ${mm(resumo.proximas3h)} previstos</span>
      <span class="barras" aria-hidden="true">${barras}</span>`;
    const focar = () => { irPara("mapa"); mapa.setView([zona.lat, zona.lon], 13); circulo.openPopup(); };
    li.addEventListener("click", focar);
    li.addEventListener("keydown", e => { if (e.key === "Enter") focar(); });
    lista.appendChild(li);
  });

  atualizarPlaca();
}

function atualizarPlaca() {
  const resultados = ultimoResultadoZonas;
  if (!resultados.length) return;
  const pior = Math.max(...resultados.map(r => r.nivel));
  const zonas = [...new Set(resultados.filter(r => r.nivel === pior && pior > 0).map(r => r.zona.nome.split(" (")[0]))];

  const placa = $("placa");
  // Pequena animação quando o nível muda
  if (placa.dataset.nivel !== String(pior) && $("placaNivel").textContent !== "—") {
    placa.classList.remove("mudou");
    void placa.offsetWidth;
    placa.classList.add("mudou");
  }
  placa.dataset.nivel = pior;
  placa.style.setProperty("--cor", NIVEIS[pior].cor);
  $("placaNivel").textContent = NIVEIS[pior].nome;
  const onde = pior === 0 ? "Nenhuma região com chuva agora" : `Zona ${zonas.join(", ")}`;
  const ruas = pontosCgeAtivos ? `. ${pontosCgeAtivos} rua(s) alagada(s)` : "";
  $("placaOnde").textContent = onde + ruas;
}

// ===================== Ruas alagadas (CGE, via servidor) =====================
const campoData = $("dataCge");
const hojeISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const dataParaCge = iso => iso.split("-").reverse().join("/");
campoData.value = hojeISO();
campoData.max = hojeISO();
let ultimaRespostaCge = null;
let pontosCgeAtivos = 0;

async function atualizarCge() {
  const status = $("statusCge");
  const ehHoje = !campoData.value || campoData.value === hojeISO();
  $("tituloCge").textContent = ehHoje ? "Ruas alagadas hoje" : `Ruas alagadas em ${dataParaCge(campoData.value)}`;

  try {
    const url = api("/api/alagamentos") + (ehHoje ? "" : `?data=${encodeURIComponent(dataParaCge(campoData.value))}`);
    const resp = await fetch(url);
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.detalhe || dados.erro);
    ultimaRespostaCge = dados;
    pontosCgeAtivos = ehHoje ? dados.ativos : 0;
    $("contadorRuas").textContent = pontosCgeAtivos;
    $("contadorRuas").hidden = !pontosCgeAtivos;

    const hora = new Date(dados.consultadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    status.textContent = dados.total
      ? `${dados.total} registro(s) no dia${ehHoje ? `, ${dados.ativos} ainda alagada(s)` : ""}. Consultado às ${hora}.`
      : (ehHoje ? "Nenhuma rua alagada registrada hoje pelo CGE." : "Nenhuma rua alagada registrada nesse dia.");
    desenharCge();
  } catch (e) {
    console.error(e);
    pontosCgeAtivos = 0;
    camadaCge.clearLayers();
    $("listaCge").innerHTML = "";
    status.textContent = "Sem dados do CGE. Confira se o servidor está rodando (pasta servidor: node server.js).";
  }
  atualizarPlaca();
}

function desenharCge() {
  const ul = $("listaCge");
  camadaCge.clearLayers();
  ul.innerHTML = "";
  if (!ultimaRespostaCge) return;

  const pontos = ultimaRespostaCge.pontos
    .filter(p => !$("chkSoAtivos").checked || p.ativo)
    .sort((a, b) => (b.ativo === true) - (a.ativo === true) || (b.inicio || "").localeCompare(a.inicio || ""));

  if (!pontos.length && ultimaRespostaCge.total) {
    ul.innerHTML = '<li class="vazio">Nenhuma rua continua alagada agora.</li>';
  }

  pontos.forEach(p => {
    const cor = p.transitavel === false ? NIVEIS[4].cor : NIVEIS[2].cor;
    const situacao = p.transitavel === false ? "Intransitável" : (p.transitavel ? "Transitável" : "Situação não informada");
    const periodo = p.inicio ? `de ${p.inicio}${p.fim ? " a " + p.fim : " até agora"}` : "";
    const detalhes = [p.sentido && `Sentido ${p.sentido}`, p.referencia && `Referência: ${p.referencia}`].filter(Boolean).join(". ");
    const fim = p.ativo ? "Alagada agora" : "Já liberada";

    if (p.lat != null) {
      const icone = L.divIcon({
        className: "",
        html: `<div class="marcador-cge${p.ativo ? " ativo" : ""}" style="--cor:${cor}"></div>`,
        iconSize: [16, 16]
      });
      L.marker([p.lat, p.lon], { icon: icone, title: p.rua, zIndexOffset: p.ativo ? 1000 : 0 })
        .bindPopup(`<strong>${escapar(p.rua)}</strong><br>${escapar(p.bairro)}<br>${situacao}, ${periodo}<br>${fim}<br><small>${escapar(detalhes)}</small>`)
        .addTo(camadaCge);
    }

    const li = document.createElement("li");
    li.className = "registro" + (p.ativo ? "" : " encerrado");
    li.innerHTML = `<div><span class="selo" style="background:${cor}"></span><span class="rua-titulo">${escapar(p.rua)}</span>
      <small>${escapar(p.bairro)}. ${situacao}, ${periodo}. ${fim}.</small>
      ${detalhes ? `<small>${escapar(detalhes)}</small>` : ""}
      ${p.lat == null ? "<small>Localizando no mapa…</small>" : ""}</div>`;
    if (p.lat != null) {
      li.style.cursor = "pointer";
      li.addEventListener("click", () => {
        irPara("mapa");
        mapa.setView([p.lat, p.lon], 16);
        camadaCge.eachLayer(m => { if (m.options.title === p.rua) m.openPopup(); });
      });
    }
    ul.appendChild(li);
  });
}

campoData.addEventListener("change", atualizarCge);
$("chkSoAtivos").addEventListener("change", desenharCge);

// ===================== Histórico =====================
let diasHistorico = 90;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

async function carregarHistorico() {
  try {
    const r = await fetch(api(`/api/historico?dias=${diasHistorico}`));
    const h = await r.json();
    desenharHistoricoPainel(h);
    desenharRuasQueMaisAlagam(h);
    desenharCalor(h);
  } catch (e) {
    console.warn("Histórico:", e.message);
    $("historicoStatus").textContent = "Histórico indisponível. Confira se o servidor está rodando.";
    desenharRuasQueMaisAlagam(null);
  }
}

function desenharHistoricoPainel(h) {
  const desde = h.primeiroDia ? dataParaCge(h.primeiroDia) : null;
  $("historicoStatus").textContent = h.diasColetados
    ? `${h.diasColetados} dia(s) no banco${desde ? `, desde ${desde}` : ""}.${h.importando ? " Ainda importando dias antigos…" : ""}`
    : (h.importando ? "Montando o histórico pela primeira vez. Isso leva alguns minutos." : "Ainda não há histórico salvo.");

  $("historicoNumeros").innerHTML = `
    <div><dt>Alagamentos</dt><dd>${numero(h.ocorrencias)}</dd></div>
    <div><dt>Dias com alagamento</dt><dd>${numero(h.diasComAlagamento)}</dd></div>
    <div><dt>Intransitáveis</dt><dd>${numero(h.intransitaveis)}</dd></div>`;

  const porMes = h.porMes.map(m => {
    const [a, mes] = m.mes.split("-");
    return { rotulo: `${MESES[+mes - 1]}${diasHistorico > 365 ? "/" + a.slice(2) : ""}`, valor: m.total };
  });
  $("graficoMes").innerHTML = graficoBarras(porMes, "alagamentos");

  const horas = Array.from({ length: 24 }, (_, hora) => ({
    rotulo: hora % 3 === 0 ? `${hora}h` : "",
    valor: (h.porHora.find(x => x.hora === hora) || {}).total || 0,
    dica: `${hora}h`
  }));
  $("graficoHora").innerHTML = graficoBarras(horas, "alagamentos");

  const ol = $("ranking");
  ol.innerHTML = "";
  if (!h.ranking.length) {
    ol.innerHTML = '<li class="vazio">Sem dados no período.</li>';
    return;
  }
  const maior = h.ranking[0].vezes;
  h.ranking.forEach(r => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="ranking-topo"><span class="rua-titulo">${escapar(r.rua)}</span><span class="ranking-vezes">${r.vezes}x</span></div>
      <span class="ranking-barra" style="width:${(r.vezes / maior) * 100}%"></span>
      <small>${escapar(r.bairro)}. ${r.intransitaveis ? `${r.intransitaveis} vez(es) intransitável. ` : ""}Última: ${dataParaCge(r.ultimaVez)}.</small>`;
    if (r.lat != null) {
      li.tabIndex = 0;
      li.addEventListener("click", () => { irPara("mapa"); mapa.setView([r.lat, r.lon], 15); });
    }
    ol.appendChild(li);
  });
}

// Gráfico de barras simples (barras em SVG, rótulos em HTML para não distorcer o texto)
function graficoBarras(dados, unidade) {
  if (!dados.length || dados.every(d => !d.valor)) return '<p class="vazio">Sem dados no período.</p>';
  const largura = 100 / dados.length;
  const maior = Math.max(...dados.map(d => d.valor));
  const barras = dados.map((d, i) => {
    const alt = d.valor ? Math.max(2, (d.valor / maior) * 100) : 0;
    return `<rect x="${i * largura + largura * 0.15}" y="${100 - alt}" width="${largura * 0.7}" height="${alt}" rx="0.8">
      <title>${d.dica || d.rotulo}: ${d.valor} ${unidade}</title></rect>`;
  }).join("");
  const rotulos = dados.map(d => `<span>${d.rotulo}</span>`).join("");
  return `<span class="grafico-max">máx. ${maior}</span>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Gráfico de ${unidade}">${barras}</svg>
    <div class="grafico-rotulos">${rotulos}</div>`;
}

// "Ruas que mais alagam" no mapa: vem do histórico; se não houver, usa a lista fixa de data.js
function desenharRuasQueMaisAlagam(h) {
  camadaHistorico.clearLayers();
  const icone = L.divIcon({ className: "", html: '<div class="marcador-historico"></div>', iconSize: [14, 14] });
  const doHistorico = h ? h.ranking.filter(r => r.lat != null && r.vezes > 1) : [];

  if (doHistorico.length) {
    doHistorico.forEach(r => {
      L.marker([r.lat, r.lon], { icon: icone, title: r.rua })
        .bindPopup(`<strong>${escapar(r.rua)}</strong><br>Alagou ${r.vezes} vezes nos últimos ${h.dias} dias.<br><small>Última: ${dataParaCge(r.ultimaVez)}</small>`)
        .addTo(camadaHistorico);
    });
  } else {
    PONTOS_HISTORICOS.forEach(p => {
      L.marker([p.lat, p.lon], { icon: icone, title: p.nome })
        .bindPopup(`<strong>${p.nome}</strong><br>Costuma alagar com chuva forte.<br><small>Posição aproximada</small>`)
        .addTo(camadaHistorico);
    });
  }
}

function desenharCalor(h) {
  if (camadaCalor) mapa.removeLayer(camadaCalor);
  camadaCalor = null;
  if (!h.calor.length || typeof L.heatLayer !== "function") return;
  const maior = Math.max(...h.calor.map(c => c[2]));
  camadaCalor = L.heatLayer(h.calor.map(([lat, lon, v]) => [lat, lon, v / maior]), {
    radius: 24, blur: 20, maxZoom: 13, minOpacity: 0.3,
    gradient: { 0.2: "#8FC1D4", 0.5: "#E2B400", 0.8: "#E5631C", 1: "#C62828" }
  });
  if ($("chkCalor").checked) camadaCalor.addTo(mapa);
}

document.querySelectorAll(".periodo button").forEach(b => b.addEventListener("click", () => {
  diasHistorico = +b.dataset.dias;
  document.querySelectorAll(".periodo button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  carregarHistorico();
}));

// ===================== Avisos no celular (Web Push) =====================
const CHAVE_AVISOS = "alagamentos-sp:avisos";
const suportaAvisos = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function chaveParaBytes(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const bruto = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...bruto].map(c => c.charCodeAt(0)));
}

function posicaoAtual() {
  return new Promise((ok, erro) => navigator.geolocation.getCurrentPosition(
    p => ok({ lat: p.coords.latitude, lon: p.coords.longitude }), erro, { timeout: 10000 }));
}

async function inscricaoAtual() {
  if (!suportaAvisos) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

async function mostrarEstadoAvisos() {
  const btn = $("btnAvisos");
  if (!suportaAvisos || !window.isSecureContext) {
    $("avisosStatus").textContent = !window.isSecureContext
      ? "Os avisos só funcionam em endereço seguro (https) ou em localhost."
      : "Este navegador não recebe avisos. No iPhone, adicione o app à tela inicial primeiro.";
    btn.disabled = true;
    $("avisosRaio").disabled = true;
    return;
  }
  const sub = await inscricaoAtual();
  let salvo = {};
  try { salvo = JSON.parse(localStorage.getItem(CHAVE_AVISOS)) || {}; } catch { /* ok */ }
  if (sub) {
    const onde = salvo.raio ? `ruas até ${salvo.raio} km de onde você estava ao ativar` : "toda a cidade";
    $("avisosStatus").textContent = `Avisos ativos para ${onde}.`;
    btn.textContent = "Desativar avisos";
    btn.dataset.ativo = "true";
    $("avisosRaio").value = String(salvo.raio || 0);
    $("btnAvisosTeste").hidden = false;
  } else {
    $("avisosStatus").textContent = "Receba uma notificação quando uma rua alagar, mesmo com o app fechado.";
    btn.textContent = "Ativar avisos";
    btn.dataset.ativo = "false";
    $("btnAvisosTeste").hidden = true;
  }
}

async function ativarAvisos() {
  const btn = $("btnAvisos");
  btn.disabled = true;
  try {
    const permissao = await Notification.requestPermission();
    if (permissao !== "granted") {
      $("avisosStatus").textContent = "Você não permitiu as notificações. Libere nas configurações do navegador.";
      return;
    }
    const raio = +$("avisosRaio").value;
    let posicao = {};
    if (raio) {
      try { posicao = await posicaoAtual(); }
      catch { $("avisosStatus").textContent = "Não foi possível pegar sua localização. Escolha \"Toda a cidade\" ou libere a localização."; return; }
    }
    const { chave } = await (await fetch(api("/api/push/chave"))).json();
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave) });
    const r = await fetch(api("/api/push/inscrever"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inscricao: sub, lat: posicao.lat, lon: posicao.lon, raioKm: raio || null })
    });
    if (!r.ok) throw new Error("servidor recusou");
    localStorage.setItem(CHAVE_AVISOS, JSON.stringify({ raio }));
  } catch (e) {
    console.error(e);
    $("avisosStatus").textContent = "Não foi possível ativar os avisos. Confira se o servidor está rodando.";
    return;
  } finally {
    btn.disabled = false;
  }
  mostrarEstadoAvisos();
}

async function desativarAvisos() {
  const sub = await inscricaoAtual();
  if (sub) {
    fetch(api("/api/push/cancelar"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint })
    }).catch(() => {});
    await sub.unsubscribe();
  }
  localStorage.removeItem(CHAVE_AVISOS);
  mostrarEstadoAvisos();
}

$("btnAvisos").addEventListener("click", () =>
  $("btnAvisos").dataset.ativo === "true" ? desativarAvisos() : ativarAvisos());

$("btnAvisosTeste").addEventListener("click", async () => {
  const sub = await inscricaoAtual();
  if (!sub) return;
  const r = await fetch(api("/api/push/teste"), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint })
  });
  $("avisosStatus").textContent = r.ok ? "Aviso de teste enviado." : "O servidor não encontrou este aparelho. Desative e ative de novo.";
});

// ===================== App instalável (PWA) =====================
if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("sw.js").then(mostrarEstadoAvisos).catch(e => console.warn("Service worker:", e));
} else {
  mostrarEstadoAvisos();
}

let pedidoInstalacao = null;
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  pedidoInstalacao = e;
  $("btnInstalar").hidden = false;
});
$("btnInstalar").addEventListener("click", async () => {
  if (!pedidoInstalacao) return;
  pedidoInstalacao.prompt();
  await pedidoInstalacao.userChoice;
  pedidoInstalacao = null;
  $("btnInstalar").hidden = true;
});
window.addEventListener("appinstalled", () => { $("btnInstalar").hidden = true; });

// ===================== Painel de filtros =====================
const btnFiltros = $("btnFiltros");
const painelFiltros = $("painelFiltros");

function abrirFiltros(abrir) {
  painelFiltros.hidden = !abrir;
  btnFiltros.setAttribute("aria-expanded", String(abrir));
}
btnFiltros.addEventListener("click", e => { e.stopPropagation(); abrirFiltros(painelFiltros.hidden); });
$("btnFecharFiltros").addEventListener("click", () => abrirFiltros(false));
document.addEventListener("keydown", e => { if (e.key === "Escape") abrirFiltros(false); });
mapa.on("click", () => abrirFiltros(false));
painelFiltros.addEventListener("click", e => e.stopPropagation());

// Cada caixa liga/desliga uma camada. O pontinho no botão avisa quando algo padrão está desligado.
const PADRAO = { chkRadar: true, chkCge: true, chkHistorico: true, chkCalor: false, chkZonas: true };
const acoesCamadas = {
  chkRadar: ligar => ligarRadar(ligar),
  chkCge: ligar => (ligar ? camadaCge.addTo(mapa) : mapa.removeLayer(camadaCge)),
  chkHistorico: ligar => (ligar ? camadaHistorico.addTo(mapa) : mapa.removeLayer(camadaHistorico)),
  chkCalor: ligar => camadaCalor && (ligar ? camadaCalor.addTo(mapa) : mapa.removeLayer(camadaCalor)),
  chkZonas: ligar => (ligar ? camadaZonas.addTo(mapa) : mapa.removeLayer(camadaZonas))
};
Object.entries(acoesCamadas).forEach(([id, acao]) => {
  $(id).addEventListener("change", e => {
    acao(e.target.checked);
    $("marcaFiltro").hidden = Object.entries(PADRAO).every(([i, v]) => $(i).checked === v);
  });
});

$("btnAtualizar").addEventListener("click", atualizar);

$("btnPerto").addEventListener("click", () => {
  if (!navigator.geolocation) return alert("Seu navegador não informa a localização.");
  posicaoAtual().then(({ lat, lon }) => {
    L.circleMarker([lat, lon], { radius: 7, color: "#fff", weight: 2, fillColor: "#2F6F8F", fillOpacity: 1 })
      .addTo(mapa).bindPopup("Você está aqui").openPopup();
    const perto = ZONAS
      .map(z => ({ z, d: mapa.distance([lat, lon], [z.lat, z.lon]) }))
      .sort((a, b) => a.d - b.d)[0];
    mapa.setView([lat, lon], 13);
    if (perto && circulosPorZona[perto.z.id]) setTimeout(() => circulosPorZona[perto.z.id].openPopup(), 600);
  }).catch(() => alert("Não foi possível pegar sua localização. Libere o acesso no navegador (só funciona em https ou localhost)."));
});

// ===================== Abas (celular) =====================
function irPara(aba) {
  if (!ehCelular()) return;
  document.body.dataset.aba = aba;
  document.querySelectorAll(".abas button").forEach(b =>
    b.setAttribute("aria-current", String(b.dataset.aba === aba)));
  if (aba === "mapa") setTimeout(() => mapa.invalidateSize(), 50);
  else document.querySelector(".painel").scrollTop = 0;
}
document.querySelectorAll(".abas button").forEach(b => b.addEventListener("click", () => irPara(b.dataset.aba)));
window.addEventListener("resize", () => mapa.invalidateSize());

// Abrir direto numa aba pelo endereço (ex.: ?aba=ruas, usado pelos avisos)
const abaInicial = new URLSearchParams(location.search).get("aba");
if (abaInicial) irPara(abaInicial);

// ===================== Atualização =====================
async function atualizar() {
  const status = $("atualizado");
  await atualizarCge();
  try {
    const dados = await buscarChuva();
    desenharZonas(ZONAS.map((zona, i) => {
      const resumo = resumir(dados[i]);
      return { zona, resumo, nivel: calcularNivel(resumo) };
    }));
    const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    status.textContent = `Atualizado às ${hora}. Próxima atualização em ${ATUALIZAR_A_CADA_MIN} min.`;
  } catch (erro) {
    console.error(erro);
    status.textContent = "Não foi possível buscar a chuva. Toque em Atualizar agora, na aba Regiões.";
    $("listaZonas").innerHTML = "";
  }
}

// ===================== Início =====================
window.addEventListener("load", () => mapa.invalidateSize());
desenharRuasQueMaisAlagam(null);
atualizar();
carregarRadar();
carregarHistorico();
setInterval(atualizar, ATUALIZAR_A_CADA_MIN * 60 * 1000);
setInterval(carregarRadar, RADAR_A_CADA_MIN * 60 * 1000);
setInterval(carregarHistorico, 30 * 60 * 1000);
