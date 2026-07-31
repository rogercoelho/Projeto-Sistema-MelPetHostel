const dbFor = require("../utils/dbFor");
const { tableExists } = require("./schema");

const TABLE = "Grupos";

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

async function ensureTable(req) {
  return tableExists(req, TABLE);
}

function normalize(row) {
  if (!row) return null;
  const id = row.id ?? row.Grupo_ID;
  const nome = row.Nome_Grupo ?? row.Grupo_Nome ?? row.nome;

  return {
    ...row,
    id,
    nome,
    Grupo_ID: id,
    Grupo_Nome: nome,
    Nome_Grupo: nome,
  };
}

async function list(req) {
  if (!(await ensureTable(req))) return [];

  const [rows] = await dbFor(req).query(
    `SELECT id, Nome_Grupo, Nome_Grupo AS nome
       FROM ${TABLE}
      ORDER BY Nome_Grupo`,
  );

  return (rows || []).map(normalize);
}

async function findById(req, id) {
  if (!(await ensureTable(req))) return null;

  const [rows] = await dbFor(req).query(
    `SELECT id, Nome_Grupo, Nome_Grupo AS nome
       FROM ${TABLE}
      WHERE id = ?
      LIMIT 1`,
    [id],
  );

  return normalize(rows && rows.length ? rows[0] : null);
}

async function findByName(req, nome) {
  if (!(await ensureTable(req))) return null;

  const [rows] = await dbFor(req).query(
    `SELECT id, Nome_Grupo, Nome_Grupo AS nome
       FROM ${TABLE}
      WHERE LOWER(TRIM(Nome_Grupo)) = LOWER(TRIM(?))
      LIMIT 1`,
    [nome],
  );

  return normalize(rows && rows.length ? rows[0] : null);
}

async function create(req, nome) {
  if (!(await ensureTable(req))) {
    throw new Error("Tabela Grupos nao encontrada.");
  }

  const groupName = clean(nome);
  const [result] = await dbFor(req).query(
    `INSERT INTO ${TABLE} (Nome_Grupo) VALUES (?)`,
    [groupName],
  );

  return findById(req, result.insertId);
}

async function remove(req, id) {
  const [result] = await dbFor(req).query(
    `DELETE FROM ${TABLE} WHERE id = ?`,
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
