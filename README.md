# Chuva e Alagamentos SP

Mapa de São Paulo com:
- pontos de alagamento do dia, lidos do site do CGE (via servidor Node);
- chuva por região e nível estimado (Open-Meteo);
- pontos que costumam alagar;
- registros de alagamento feitos por você.

## Como rodar (Node 18 ou mais novo)

    cd servidor
    npm install
    node server.js

Depois abra http://localhost:3000 no navegador.

## Como funciona a leitura do CGE
- O navegador não consegue ler o site do CGE direto (bloqueio de CORS), então o
  `servidor/server.js` baixa a página `cgesp.org/v3/alagamentos.jsp`, extrai os pontos
  com o cheerio e entrega em `http://localhost:3000/api/alagamentos`.
- Dia específico: `/api/alagamentos?data=14/10/2026`
- O CGE só é consultado no máximo 1 vez a cada 2 minutos (cache).
- O CGE não informa coordenadas. O servidor procura cada rua no OpenStreetMap
  (Nominatim, 1 consulta por segundo) e guarda em `geocache.json`.
  Pontos novos aparecem na lista na hora e no mapa depois de alguns segundos.
- A última página baixada fica salva em `servidor/ultima-pagina-cge.html`.
  Se a lista vier vazia em dia de chuva, a estrutura do site mudou: abra esse
  arquivo e ajuste a função `extrairPontos` no server.js.

## Arquivos
- `index.html`, `style.css`, `script.js`, `data.js`: front-end
- `servidor/server.js`, `servidor/package.json`: leitura do CGE
