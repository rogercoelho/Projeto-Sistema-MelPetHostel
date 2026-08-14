const dbFor = require("../utils/dbFor");
const { tableExists } = require("./schema");

const TABLE = "Grupos";

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

async function ensureTable(req) {
  return tableExists(req, TABLE);
}

async function getColumns(req) {
  if (!(await ensureTable(req))) return new Map();
  const [rows] = await dbFor(req).query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    [TABLE],
  );
  const columns = new Map();
  for (const row of rows || []) {
    const columnName = clean(row?.COLUMN_NAME);
    if (columnName) columns.set(columnName.toLowerCase(), columnName);
  }
  return columns;
}

function pickColumn(columns, candidates) {
  for (const candidate of candidates) {
    const column = columns.get(String(candidate).toLowerCase());
    if (column) return column;
  }
  return null;
}

function normalizeTela(value) {
  const tela = clean(value).toLowerCase();
  if (["adm", "admin", "administracao", "administrador"].includes(tela)) return "adm";
  return "usuario";
}

function normalize(row) {
  if (!row) return null;
  const id = row.id ?? row.Grupo_ID;
  const nome = row.Nome_Grupo ?? row.Grupo_Nome ?? row.nome;
  const tela = row.tela ?? row.Tela ?? row.modulo ?? row.Modulo ?? row.Tipo_Tela ?? row.tipo_tela ?? "";

  return {
    ...row,
    id,
    nome,
    tela,
    Grupo_ID: id,
    Grupo_Nome: nome,
    Nome_Grupo: nome,
  };
}

async function getTelaColumn(req) {
  const columns = await getColumns(req);
  return pickColumn(columns, ["Tela", "tela", "Modulo", "modulo", "Tipo_Tela", "tipo_tela"]);
}

async function list(req) {
  if (!(await ensureTable(req))) return [];

  const telaCol = await getTelaColumn(req);
  const selectTela = telaCol ? ", " + telaCol + " AS tela" : "";
  const [rows] = await dbFor(req).query(
    "SELECT id, Nome_Grupo, Nome_Grupo AS nome" + selectTela + " FROM " + TABLE + " ORDER BY Nome_Grupo",
  );

  return (rows || []).map(normalize);
}

async function findById(req, id) {
  if (!(await ensureTable(req))) return null;

  const telaCol = await getTelaColumn(req);
  const selectTela = telaCol ? ", " + telaCol + " AS tela" : "";
  const [rows] = await dbFor(req).query(
    "SELECT id, Nome_Grupo, Nome_Grupo AS nome" + selectTela + " FROM " + TABLE + " WHERE id = ? LIMIT 1",
    [id],
  );

  return normalize(rows && rows.length ? rows[0] : null);
}

async function findByName(req, nome) {
  if (!(await ensureTable(req))) return null;

  const telaCol = await getTelaColumn(req);
  const selectTela = telaCol ? ", " + telaCol + " AS tela" : "";
  const [rows] = await dbFor(req).query(
    "SELECT id, Nome_Grupo, Nome_Grupo AS nome" + selectTela + " FROM " + TABLE + " WHERE LOWER(TRIM(Nome_Grupo)) = LOWER(TRIM(?)) LIMIT 1",
    [nome],
  );

  return normalize(rows && rows.length ? rows[0] : null);
}

async function create(req, nome, tela = "usuario") {
  if (!(await ensureTable(req))) {
    throw new Error("Tabela Grupos nao encontrada.");
  }

  const groupName = clean(nome);
  const telaCol = await getTelaColumn(req);
  const insertColumns = ["Nome_Grupo"];
  const values = [groupName];
  if (telaCol) {
    insertColumns.push(telaCol);
    values.push(normalizeTela(tela));
  }

  const [result] = await dbFor(req).query(
    "INSERT INTO " + TABLE + " (" + insertColumns.join(", ") + ") VALUES (" + insertColumns.map(() => "?").join(", ") + ")",
    values,
  );

  return findById(req, result.insertId);
}

async function remove(req, id) {
  const [result] = await dbFor(req).query(
    "DELETE FROM " + TABLE + " WHERE id = ?",
    [id],
  );

  return result;
}

module.exports = {
  TABLE,
  create,
  findById,
  findByName,
  list,
  remove,
};
