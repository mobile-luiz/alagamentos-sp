// Regiões monitoradas: cada uma vira uma consulta de chuva na Open-Meteo.
// Coordenadas aproximadas do centro de cada área. Pode adicionar ou trocar à vontade.
const ZONAS = [
  { id: "centro",      nome: "Centro",                 lat: -23.5505, lon: -46.6333 },
  { id: "norte",       nome: "Norte (Santana)",        lat: -23.5025, lon: -46.6250 },
  { id: "noroeste",    nome: "Norte (Perus/Brasilândia)", lat: -23.4620, lon: -46.7000 },
  { id: "oeste",       nome: "Oeste (Pinheiros/Lapa)", lat: -23.5450, lon: -46.7000 },
  { id: "leste1",      nome: "Leste (Itaquera)",       lat: -23.5400, lon: -46.4560 },
  { id: "leste2",      nome: "Leste (São Miguel)",     lat: -23.4980, lon: -46.4440 },
  { id: "sudeste",     nome: "Sudeste (Mooca/V. Prudente)", lat: -23.5820, lon: -46.5800 },
  { id: "sul1",        nome: "Sul (Santo Amaro)",      lat: -23.6520, lon: -46.7100 },
  { id: "sul2",        nome: "Sul (Parelheiros)",      lat: -23.8200, lon: -46.7300 }
];

// Pontos conhecidos por alagar com frequência (referência histórica, posição aproximada).
// Não indicam alagamento agora. Edite com os pontos que você conhece.
const PONTOS_HISTORICOS = [
  { nome: "Vale do Anhangabaú / Praça da Bandeira", lat: -23.5470, lon: -46.6390 },
  { nome: "Marginal Tietê, Ponte das Bandeiras",     lat: -23.5160, lon: -46.6280 },
  { nome: "Marginal Pinheiros, Ponte Cidade Jardim", lat: -23.5850, lon: -46.6950 },
  { nome: "Av. do Estado (Rio Tamanduateí)",          lat: -23.5560, lon: -46.6200 },
  { nome: "Av. Pacaembu",                             lat: -23.5400, lon: -46.6650 },
  { nome: "Av. Ricardo Jafet (Ipiranga)",             lat: -23.5970, lon: -46.6100 },
  { nome: "Av. Aricanduva",                           lat: -23.5600, lon: -46.5150 },
  { nome: "Av. Luiz Ignácio de Anhaia Mello",         lat: -23.5900, lon: -46.5600 },
  { nome: "Av. Jacu-Pêssego",                         lat: -23.5400, lon: -46.4500 }
];

// Níveis estimados, com os mesmos nomes usados pelo CGE.
const NIVEIS = [
  { nome: "Sem chuva",     cor: "#7A8A94" },
  { nome: "Observação",    cor: "#3D8B5A" },
  { nome: "Atenção",       cor: "#E2B400" },
  { nome: "Alerta",        cor: "#E5631C" },
  { nome: "Alerta máximo", cor: "#C62828" }
];
