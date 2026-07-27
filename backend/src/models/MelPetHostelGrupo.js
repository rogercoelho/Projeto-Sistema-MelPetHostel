const dbFor = require("../utils/dbFor");

const TABLE = "MelPetHostel_Grupos";

async function list(req) {
  const [rows] = await dbFor(req).query(
    `SELECT Grupo_ID AS id, Grupo_Nome AS nome, Created_At, Updated_At
       FROM ${TABLE}
      ORDER BY Grupo_Nome`,
  );
  return rows || [];
}

async function findById(req, id) {
  const [rows] = await dbFor(req).query(
    `SELECT Grupo_ID, Grupo_Nome, Created_At, Updated_At
       FROM ${TABLE}
      WHERE Grupo_ID = ?
      LIMIT 1`,
    [id],
  );
  return rows && rows.length ? rows[0] : null;
}

async function findByName(req, nome) {
  const [rows] = await dbFor(req).query(
    `SELECT Grupo_ID, Grupo_Nome, Created_At, Updated_At
       FROM ${TABLE}
      WHERE Grupo_Nome = ?
      LIMIT 1`,
    [nome],
  );
  return rows && rows.length ? rows[0] : null;
}

async function create(req, nome) {
  const [result] = await dbFor(req).query(
    `INSERT INTO ${TABLE} (Grupo_Nome) VALUES (?)`,
    [nome],
  );
  return findById(req, result.insertId);
}

async function remove(req, id) {
  const [result] = await dbFor(req).query(
    `DELETE FROM ${TABLE} WHERE Grupo_ID = ?`,
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
