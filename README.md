# Chuva e Alagamentos SP

Painel da cidade de São Paulo com:

- **Ruas alagadas** do dia, lidas do site do CGE, com nome por extenso, sentido, referência e horário.
- **Radar de chuva animado** das últimas 2 horas (RainViewer).
- **Histórico** guardado em banco SQLite: ranking das ruas que mais alagam, gráficos por mês e por horário, mapa de calor.
- **Chuva por região** com nível estimado (Open-Meteo).
- **App instalável** (PWA) com **avisos no celular** quando uma rua alagar.
- Tema automático, claro ou escuro; layout para celular com abas.

## Rodar no PC

Precisa do **Node 22.13 ou mais novo** (`node -v` para conferir).

    cd servidor
    npm install
    node server.js

Abra http://localhost:3000.

Na primeira vez, o servidor importa os últimos 90 dias do CGE para montar o histórico
(1 dia a cada 2,5 s, uns 4 minutos). Depois disso ele consulta o CGE a cada 3 minutos
e confere de hora em hora se faltou algum dia.

## Colocar online (Render)

1. Gere as chaves dos avisos: `cd servidor` e `node gerar-chaves.js`.
2. No Render: **New > Blueprint**, escolha este repositório (ele lê o `render.yaml`).
3. Cole `VAPID_PUBLIC` e `VAPID_PRIVATE` nas variáveis de ambiente. Em `VAPID_EMAIL`,
   coloque `mailto:` seguido de um e-mail seu.
4. Pronto: a página e o servidor ficam no mesmo endereço `https://...onrender.com`.

Limites do plano grátis do Render:
- O serviço "dorme" depois de 15 minutos sem acesso. Dormindo, não coleta o CGE nem manda avisos.
- O disco é apagado a cada reinício. O histórico é reimportado sozinho (últimos 60 dias),
  mas as inscrições de avisos se perdem: quem ativou precisa ativar de novo.
  Para não perder nada, use um disco persistente do Render (plano pago) e aponte
  `PASTA_DADOS` para ele.

### Página no GitHub Pages e servidor no Render

Se preferir a página no GitHub Pages, edite o `config.js` e coloque o endereço do Render
em `API_BASE`.

## Variáveis de ambiente (opcionais)

| Variável | Para que serve | Padrão |
|---|---|---|
| `PORT` | Porta do servidor | 3000 |
| `HISTORICO_DIAS` | Quantos dias passados importar | 90 |
| `COLETA_MIN` | Intervalo de consulta ao CGE (min) | 3 |
| `PASTA_DADOS` | Onde ficam banco, cache e chaves | servidor/dados |
| `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_EMAIL` | Chaves dos avisos | geradas sozinhas no PC |

## Observações

- O CGE não tem API: o servidor lê a página `cgesp.org/v3/alagamentos.jsp`. Se o site mudar,
  a última página baixada fica em `servidor/ultima-pagina-cge.html` para ajustar `cge.js`.
- O nível de cada região é uma estimativa a partir da chuva; o estado oficial é do CGE.
- Radar grátis do RainViewer: só uso pessoal ou educacional, zoom máximo 7 (fica borrado de perto).
- Avisos e "Ver minha região" só funcionam em `https://` ou `localhost`.

## Arquivos

- `index.html`, `style.css`, `script.js`, `data.js`, `config.js`: página
- `sw.js`, `manifest.json`, `icones/`: app instalável e avisos
- `servidor/server.js`: rotas da API
- `servidor/cge.js`: leitura do site do CGE
- `servidor/coletor.js`: coleta automática e importação do histórico
- `servidor/banco.js`: banco SQLite
- `servidor/push.js`: envio dos avisos
- `servidor/geo.js`: localização das ruas no mapa
