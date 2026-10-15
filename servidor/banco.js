// Banco de dados SQLite (já vem no Node 22.13 ou mais novo, sem instalar nada).
// Guarda o histórico de alagamentos e as inscrições dos avisos no celular.
// Esconde só o aviso "SQLite is an experimental feature"
const emitirAviso = process.emitWarning;
process.emitWarning = (aviso, ...resto) =>
  String(aviso).includes("SQLite") ? undefined : emitirAviso.call(process, aviso, ...resto);
const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const { PASTA_DADOS } = require("./geo");

const db = new DatabaseSync(process.env.DB_PATH || path.join(PASTA_DADOS, "alagamentos.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS ocorrencias (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    rua TEXT NOT NULL,
    bairro TEXT,
    sentido TEXT,
    referencia TEXT,
    inicio TEXT,
    fim TEXT,
    ativo INTEGER,
    transitavel INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_ocorrencias_data ON ocorrencias(data);

  CREATE TABLE IF NOT EXISTS dias_coletados (
    data TEXT PRIMARY KEY,
    coletado_em TEXT,
    completo INTEGER
  );

  CREATE TABLE IF NOT EXISTS inscricoes (
    endpoint TEXT PRIMARY KEY,
    dados TEXT NOT NULL,
    lat REAL,
    lon REAL,
    raio_km REAL,
    criado_em TEXT
  );

  CREATE TABLE IF NOT EXISTS avisados (
    chave TEXT PRIMARY KEY,
    em TEXT
  );
`);

const { idOcorrencia } = require("./cge");
const agora = () => new Date().toISOString();
const bool = v => (v === null || v === undefined ? null : v ? 1 : 0);

// ---------- Ocorrências ----------
const sqlSalvar = db.prepare(`
  INSERT INTO ocorrencias (id, data, rua, bairro, sentido, referencia, inicio, fim, ativo, transitavel)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET fim = excluded.fim, ativo = excluded.ativo, transitavel = excluded.transitavel
`);
const sqlDia = db.prepare(`
  INSERT INTO dias_coletados (data, coletado_em, completo) VALUES (?, ?, ?)
  ON CONFLICT(data) DO UPDATE SET coletado_em = excluded.coletado_em, completo = excluded.completo
`);

function salvarDia(dataISO, pontos, completo) {
  db.exec("BEGIN");
  try {
    for (const p of pontos) {
      sqlSalvar.run(idOcorrencia(dataISO, p), dataISO, p.rua, p.bairro, p.sentido, p.referencia,
        p.inicio, p.fim, bool(p.ativo), bool(p.transitavel));
    }
    sqlDia.run(dataISO, agora(), completo ? 1 : 0);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

const sqlDiaCompleto = db.prepare("SELECT completo FROM dias_coletados WHERE data = ?");
const diaCompleto = dataISO => sqlDiaCompleto.get(dataISO)?.completo === 1;

const sqlPontosDia = db.prepare(`
  SELECT rua, bairro, sentido, referencia, inicio, fim, ativo, transitavel
  FROM ocorrencias WHERE data = ? ORDER BY inicio
`);
function pontosDoBanco(dataISO) {
  return sqlPontosDia.all(dataISO).map(r => ({
    ...r,
    ativo: r.ativo === null ? null : !!r.ativo,
    transitavel: r.transitavel === null ? null : !!r.transitavel
  }));
}

// ---------- Resumo do histórico ----------
function resumo(dias) {
  const desde = new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);
  const um = (sql, ...a) => db.prepare(sql).get(...a);
  const varios = (sql, ...a) => db.prepare(sql).all(...a);

  const totais = um(`
    SELECT COUNT(*) AS ocorrencias,
           COUNT(DISTINCT data) AS diasComAlagamento,
           COALESCE(SUM(transitavel = 0), 0) AS intransitaveis
    FROM ocorrencias WHERE data >= ?`, desde);

  const coleta = um(`
    SELECT COUNT(*) AS diasColetados, MIN(data) AS primeiroDia
    FROM dias_coletados WHERE data >= ?`, desde);

  const porMes = varios(`
    SELECT substr(data, 1, 7) AS mes, COUNT(*) AS total
    FROM ocorrencias WHERE data >= ? GROUP BY mes ORDER BY mes`, desde);

  const porHora = varios(`
    SELECT CAST(substr(inicio, 1, 2) AS INTEGER) AS hora, COUNT(*) AS total
    FROM ocorrencias WHERE data >= ? AND inicio <> '' GROUP BY hora ORDER BY hora`, desde);

  const ruas = varios(`
    SELECT rua, MAX(bairro) AS bairro, COUNT(*) AS vezes,
           COALESCE(SUM(transitavel = 0), 0) AS intransitaveis,
           MAX(data) AS ultimaVez
    FROM ocorrencias WHERE data >= ?
    GROUP BY lower(rua), lower(bairro) ORDER BY vezes DESC, ultimaVez DESC`, desde);

  return { dias, desde, ...totais, ...coleta, porMes, porHora, ruas };
}

// ---------- Inscrições de avisos ----------
const sqlInscrever = db.prepare(`
  INSERT INTO inscricoes (endpoint, dados, lat, lon, raio_km, criado_em) VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(endpoint) DO UPDATE SET dados = excluded.dados, lat = excluded.lat,
    lon = excluded.lon, raio_km = excluded.raio_km
`);
const inscrever = (sub, lat, lon, raioKm) =>
  sqlInscrever.run(sub.endpoint, JSON.stringify(sub), lat ?? null, lon ?? null, raioKm ?? null, agora());
const cancelarInscricao = endpoint => db.prepare("DELETE FROM inscricoes WHERE endpoint = ?").run(endpoint);
const inscricoes = () => db.prepare("SELECT * FROM inscricoes").all();
const buscarInscricao = endpoint => db.prepare("SELECT * FROM inscricoes WHERE endpoint = ?").get(endpoint);

const jaAvisado = chave => !!db.prepare("SELECT 1 FROM avisados WHERE chave = ?").get(chave);
const marcarAvisado = chave => db.prepare("INSERT OR IGNORE INTO avisados (chave, em) VALUES (?, ?)").run(chave, agora());

module.exports = {
  salvarDia, diaCompleto, pontosDoBanco, resumo,
  inscrever, cancelarInscricao, inscricoes, buscarInscricao, jaAvisado, marcarAvisado
};
