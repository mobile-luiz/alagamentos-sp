// ===================== Configuração =====================
const ATUALIZAR_A_CADA_MIN = 3;
const HORAS_PASSADAS = 6;
const HORAS_FUTURAS = 6;

// ===================== Mapa =====================
const mapa = L.map("mapa", { zoomControl: true }).setView([-23.60, -46.62], 10);

// Endereço do servidor (servidor/server.js). Se a página foi aberta como arquivo, usa localhost:3000.
const BASE_SERVIDOR = location.protocol.startsWith("http") ? "" : "http://localhost:3000";

// ---------- Mapas de fundo (todos grátis e sem chave) ----------
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const CREDITO_CHUVA = ' | Chuva: <a href="https://open-meteo.com/">Open-Meteo</a>';

const mapaRuas = L.tileLayer(`${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`, {
  maxZoom: 19,
  attribution: "Mapa &copy; Esri" + CREDITO_CHUVA
});

const mapaOsm = L.tileLayer(`${BASE_SERVIDOR}/tiles/{z}/{x}/{y}.png`, {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' + CREDITO_CHUVA
});

const satelite = L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, {
  maxZoom: 19,
  attribution: "Imagens &copy; Esri, Maxar, Earthstar Geographics" + CREDITO_CHUVA
});

// Satélite com nomes de ruas e bairros por cima
const sateliteComNomes = L.layerGroup([
  L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, {
    maxZoom: 19, attribution: "Imagens &copy; Esri, Maxar, Earthstar Geographics" + CREDITO_CHUVA
  }),
  L.tileLayer(`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19 }),
  L.tileLayer(`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19 })
]);

// Mapa escuro de verdade (sem filtro de cor): fundo cinza-escuro + nomes por cima
const mapaEscuro = L.layerGroup([
  L.tileLayer(`${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
    maxZoom: 16, attribution: "Mapa &copy; Esri" + CREDITO_CHUVA
  }),
  L.tileLayer(`${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16 })
]);

const relevo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
  maxZoom: 17, subdomains: "abc",
  attribution: 'Relevo &copy; <a href="https://opentopomap.org">OpenTopoMap</a>' + CREDITO_CHUVA
});

const mapasDeFundo = {
  "Mapa": mapaRuas,
  "Mapa escuro": mapaEscuro,
  "OpenStreetMap": mapaOsm,
  "Satélite": satelite,
  "Satélite com nomes": sateliteComNomes,
  "Relevo": relevo
};

// Começa com o mapa escuro se o sistema estiver no tema escuro
const temaEscuro = window.matchMedia("(prefers-color-scheme: dark)").matches;
const ehCelular = () => window.matchMedia("(max-width: 820px)").matches;
let fundoAtual = null;

// Troca o mapa de fundo e marca a opção escolhida no painel de filtros
function trocarFundo(nome) {
  const camada = mapasDeFundo[nome];
  if (!camada || camada === fundoAtual) return;
  if (fundoAtual) mapa.removeLayer(fundoAtual);
  camada.addTo(mapa);
  fundoAtual = camada;
  document.querySelectorAll("#opcoesFundo button").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.fundo === nome)));
}

// Monta os botões de tipo de mapa
const opcoesFundo = document.getElementById("opcoesFundo");
Object.keys(mapasDeFundo).forEach(nome => {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.fundo = nome;
  b.textContent = nome;
  b.setAttribute("aria-pressed", "false");
  b.addEventListener("click", () => trocarFundo(nome));
  opcoesFundo.appendChild(b);
});
trocarFundo(temaEscuro ? "Mapa escuro" : "Mapa");

// Se o mapa escolhido não carregar nenhum pedaço, troca sozinho para o próximo
const ordemReserva = ["Mapa", "OpenStreetMap", "Relevo", "Satélite"];
ordemReserva.forEach((nome, i) => {
  const camada = mapasDeFundo[nome];
  camada._erros = 0;
  camada._ok = 0;
  camada.on("tileload", () => { camada._ok++; });
  camada.on("tileerror", () => {
    camada._erros++;
    if (camada._ok === 0 && camada._erros === 6 && fundoAtual === camada && ordemReserva[i + 1]) {
      console.warn("Mapa de fundo falhou, trocando para o próximo.");
      trocarFundo(ordemReserva[i + 1]);
    }
  });
});

const camadaZonas = L.layerGroup().addTo(mapa);
const camadaHistorico = L.layerGroup().addTo(mapa);
const circulosPorZona = {};

// ===================== Chuva (Open-Meteo) =====================
async function buscarChuva() {
  const lats = ZONAS.map(z => z.lat).join(",");
  const lons = ZONAS.map(z => z.lon).join(",");
  const url = "https://api.open-meteo.com/v1/forecast"
    + `?latitude=${lats}&longitude=${lons}`
    + "&current=precipitation"
    + "&hourly=precipitation,precipitation_probability"
    + `&past_hours=${HORAS_PASSADAS}&forecast_hours=${HORAS_FUTURAS + 1}`
    + "&timezone=America%2FSao_Paulo";

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Open-Meteo respondeu ${resp.status}`);
  const dados = await resp.json();
  // Com várias coordenadas a API devolve uma lista; com uma só, um objeto.
  return Array.isArray(dados) ? dados : [dados];
}

// Transforma a resposta de uma região em números fáceis de usar
function resumir(dado) {
  const horas = dado.hourly.time;
  const chuva = dado.hourly.precipitation.map(v => v ?? 0);
  const prob = dado.hourly.precipitation_probability || [];
  const agoraTxt = dado.current.time;

  // Índice da última hora já fechada (o valor de cada hora é a chuva da hora anterior)
  let idx = 0;
  horas.forEach((h, i) => { if (h <= agoraTxt) idx = i; });

  const soma = (a, b) => chuva.slice(Math.max(a, 0), b + 1).reduce((s, v) => s + v, 0);

  return {
    ultimas3h: soma(idx - 2, idx),
    proximas3h: soma(idx + 1, idx + 3),
    probMax: Math.max(0, ...prob.slice(idx + 1, idx + 4).filter(v => v != null)),
    // "current.precipitation" é a chuva dos últimos 15 min; x4 dá mm/h aproximado
    intensidade: (dado.current.precipitation ?? 0) * 4,
    serie: chuva,
    idxAgora: idx
  };
}

// Regra de nível ESTIMADO (não é o critério oficial do CGE)
function calcularNivel(r) {
  const { ultimas3h: p3, intensidade: i, proximas3h: f3 } = r;
  if (p3 >= 50 || i >= 30) return 4;
  if (p3 >= 30 || i >= 15) return 3;
  if (p3 >= 10 || i >= 5 || f3 >= 15) return 2;
  if (p3 >= 0.5 || f3 >= 0.5) return 1;
  return 0;
}

const mm = v => `${v.toFixed(1).replace(".", ",")} mm`;

// ===================== Desenho =====================
function desenharZonas(resultados) {
  camadaZonas.clearLayers();
  const lista = document.getElementById("listaZonas");
  lista.innerHTML = "";

  resultados.forEach(({ zona, resumo, nivel }) => {
    const cor = NIVEIS[nivel].cor;

    const circulo = L.circle([zona.lat, zona.lon], {
      radius: 3200,
      color: cor,
      weight: 2,
      fillColor: cor,
      fillOpacity: nivel === 0 ? 0.12 : 0.3
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
      <span class="barras" aria-hidden="true">${barras}</span>
    `;
    const focar = () => { irPara("mapa"); mapa.setView([zona.lat, zona.lon], 13); circulo.openPopup(); };
    li.addEventListener("click", focar);
    li.addEventListener("keydown", e => { if (e.key === "Enter") focar(); });
    lista.appendChild(li);
  });

  atualizarPlaca(resultados);
}

function atualizarPlaca(resultados) {
  const pior = Math.max(...resultados.map(r => r.nivel));
  const zonasPiores = resultados.filter(r => r.nivel === pior && pior > 0).map(r => r.zona.nome.split(" (")[0]);
  const unicas = [...new Set(zonasPiores)];

  const placa = document.getElementById("placa");
  placa.dataset.nivel = pior;
  placa.style.setProperty("--cor", NIVEIS[pior].cor);
  document.getElementById("placaNivel").textContent = NIVEIS[pior].nome;
  const onde = pior === 0 ? "Nenhuma região com chuva agora" : `Zona ${unicas.join(", ")}`;
  const cge = pontosCgeAtivos ? `. ${pontosCgeAtivos} alagamento(s) ativo(s) no CGE` : "";
  document.getElementById("placaOnde").textContent = onde + cge;
}

function desenharHistorico() {
  camadaHistorico.clearLayers();
  const icone = L.divIcon({ className: "", html: '<div class="marcador-historico"></div>', iconSize: [14, 14] });
  PONTOS_HISTORICOS.forEach(p => {
    L.marker([p.lat, p.lon], { icon: icone, title: p.nome })
      .bindPopup(`<strong>${p.nome}</strong><br>Costuma alagar com chuva forte.<br><small>Posição aproximada</small>`)
      .addTo(camadaHistorico);
  });
}

// ===================== Alagamentos do CGE (via servidor/server.js) =====================
// Se a página foi aberta pelo servidor, usa o mesmo endereço; se foi aberta como arquivo, usa localhost:3000
const API_CGE = BASE_SERVIDOR + "/api/alagamentos";
const camadaCge = L.layerGroup().addTo(mapa);
let pontosCgeAtivos = 0;

// Data escolhida (vazio = hoje). O input usa AAAA-MM-DD; o CGE usa DD/MM/AAAA.
const campoData = document.getElementById("dataCge");
const chkSoAtivos = document.getElementById("chkSoAtivos");
const hojeISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
campoData.value = hojeISO();
campoData.max = hojeISO();
let ultimaRespostaCge = null;

function dataParaCge(iso) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

async function atualizarCge() {
  const status = document.getElementById("statusCge");
  const ehHoje = !campoData.value || campoData.value === hojeISO();
  document.getElementById("tituloCge").textContent =
    ehHoje ? "Ruas alagadas hoje" : `Ruas alagadas em ${dataParaCge(campoData.value)}`;

  try {
    const url = API_CGE + (ehHoje ? "" : `?data=${encodeURIComponent(dataParaCge(campoData.value))}`);
    const resp = await fetch(url);
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.detalhe || dados.erro);
    ultimaRespostaCge = dados;
    pontosCgeAtivos = ehHoje ? dados.ativos : 0;
    const contador = document.getElementById("contadorRuas");
    contador.textContent = pontosCgeAtivos;
    contador.hidden = !pontosCgeAtivos;

    const hora = new Date(dados.consultadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    status.textContent = dados.total
      ? `${dados.total} registro(s) no dia${ehHoje ? `, ${dados.ativos} ainda alagado(s)` : ""}. Consultado às ${hora}.`
      : (ehHoje ? "Nenhuma rua alagada registrada hoje pelo CGE." : "Nenhuma rua alagada registrada nesse dia.");
    desenharCge();
  } catch (e) {
    console.error(e);
    pontosCgeAtivos = 0;
    camadaCge.clearLayers();
    document.getElementById("listaCge").innerHTML = "";
    status.textContent = "Sem dados do CGE. Rode o servidor (pasta servidor: node server.js) e abra http://localhost:3000.";
  }
}

function desenharCge() {
  const ul = document.getElementById("listaCge");
  camadaCge.clearLayers();
  ul.innerHTML = "";
  if (!ultimaRespostaCge) return;

  const pontos = ultimaRespostaCge.pontos
    .filter(p => !chkSoAtivos.checked || p.ativo)
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
        html: `<div class="marcador-cge" style="background:${cor};opacity:${p.ativo ? 1 : .45}"></div>`,
        iconSize: [16, 16]
      });
      L.marker([p.lat, p.lon], { icon: icone, title: p.rua })
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
chkSoAtivos.addEventListener("change", desenharCge);

// ===================== Ciclo de atualização =====================
async function atualizar() {
  const status = document.getElementById("atualizado");
  status.textContent = "Atualizando…";
  await atualizarCge();
  try {
    const dados = await buscarChuva();
    const resultados = ZONAS.map((zona, i) => {
      const resumo = resumir(dados[i]);
      return { zona, resumo, nivel: calcularNivel(resumo) };
    });
    desenharZonas(resultados);
    const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    status.textContent = `Atualizado às ${hora}. Próxima atualização em ${ATUALIZAR_A_CADA_MIN} min.`;
  } catch (erro) {
    console.error(erro);
    status.textContent = "Não foi possível buscar a chuva. Verifique a internet e toque em Atualizar agora.";
  }
}

// ===================== Utilidades =====================
function escapar(t) {
  const d = document.createElement("div");
  d.textContent = t;
  return d.innerHTML;
}

// ===================== Outros botões =====================
// ---------- Painel de filtros ----------
const btnFiltros = document.getElementById("btnFiltros");
const painelFiltros = document.getElementById("painelFiltros");

function abrirFiltros(abrir) {
  painelFiltros.hidden = !abrir;
  btnFiltros.setAttribute("aria-expanded", String(abrir));
}
btnFiltros.addEventListener("click", e => { e.stopPropagation(); abrirFiltros(painelFiltros.hidden); });
document.getElementById("btnFecharFiltros").addEventListener("click", () => abrirFiltros(false));
document.addEventListener("keydown", e => { if (e.key === "Escape") abrirFiltros(false); });
mapa.on("click", () => abrirFiltros(false));
painelFiltros.addEventListener("click", e => e.stopPropagation());

// Liga/desliga camadas e mostra um pontinho no botão quando algo está escondido
const chavesCamadas = [
  ["chkCge", camadaCge],
  ["chkHistorico", camadaHistorico],
  ["chkZonas", camadaZonas]
];
chavesCamadas.forEach(([id, camada]) => {
  document.getElementById(id).addEventListener("change", e => {
    e.target.checked ? camada.addTo(mapa) : mapa.removeLayer(camada);
    document.getElementById("marcaFiltro").hidden =
      chavesCamadas.every(([i]) => document.getElementById(i).checked);
  });
});

document.getElementById("btnAtualizar").addEventListener("click", atualizar);

document.getElementById("btnPerto").addEventListener("click", () => {
  if (!navigator.geolocation) return alert("Seu navegador não informa a localização.");
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    L.circleMarker([latitude, longitude], { radius: 7, color: "#fff", weight: 2, fillColor: "#2F6F8F", fillOpacity: 1 })
      .addTo(mapa).bindPopup("Você está aqui").openPopup();

    // Região mais próxima
    const perto = ZONAS
      .map(z => ({ z, d: mapa.distance([latitude, longitude], [z.lat, z.lon]) }))
      .sort((a, b) => a.d - b.d)[0];
    mapa.setView([latitude, longitude], 13);
    if (perto && circulosPorZona[perto.z.id]) setTimeout(() => circulosPorZona[perto.z.id].openPopup(), 600);
  }, () => alert("Não foi possível pegar sua localização. Libere o acesso no navegador."));
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
document.querySelectorAll(".abas button").forEach(b =>
  b.addEventListener("click", () => irPara(b.dataset.aba)));

// Ao girar o celular ou redimensionar, o mapa recalcula o tamanho
window.addEventListener("resize", () => mapa.invalidateSize());

// ===================== Início =====================
// Garante que o mapa calcule o tamanho certo depois que a página monta
window.addEventListener("load", () => mapa.invalidateSize());
desenharHistorico();
atualizar();
setInterval(atualizar, ATUALIZAR_A_CADA_MIN * 60 * 1000);