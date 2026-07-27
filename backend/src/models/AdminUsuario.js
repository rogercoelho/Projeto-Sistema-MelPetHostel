const dbFor = require("../utils/dbFor");
const {
  firstAccessColumnValues,
  getTableColumnsMap,
  pickColumn,
  tableExists,
} = require("./schema");

const TABLE = "Usuarios";

async function ensureTable(req) {
  return tableExists(req, TABLE);
}

async function findByLogin(req, login) {
  if (!(await ensureTable(req))) return null;
  const [rows] = await dbFor(req).query(
    `SELECT * FROM ${TABLE} WHERE Usuario_Login = ? LIMIT 1`,
    [login],
  );
  return rows && rows.length ? rows[0] : null;
}

async function findById(req, id) {
  if (!(await ensureTable(req))) return null;
  const [rows] = await dbFor(req).query(
    `SELECT * FROM ${TABLE} WHERE Usuario_ID = ? LIMIT 1`,
    [id],
  );
  return rows && rows.length ? rows[0] : null;
}

async function listAdmins(req) {
  if (!(await ensureTable(req))) return [];
  const [rows] = await dbFor(req).query(
    `
      SELECT Usuario_ID AS id,
             Usuario_Login AS login,
             COALESCE(NULLIF(TRIM(Usuario_Grupo), ''), 'Administradores') AS grupo,
             Created_At,
             Updated_At
      FROM ${TABLE}
      WHERE LOWER(COALESCE(Usuario_Grupo, '')) LIKE '%admin%'
      ORDER BY Usuario_Login
    `,
  );
  return rows || [];
}

async function listAdminGroups(req) {
  if (!(await ensureTable(req))) {
    return [{ id: "Administradores", nome: "Administradores" }];
  }

  const [rows] = await dbFor(req).query(
    `
      SELECT DISTINCT
             COALESCE(NULLIF(TRIM(Usuario_Grupo), ''), 'Administradores') AS nome
      FROM ${TABLE}
      WHERE LOWER(COALESCE(Usuario_Grupo, '')) LIKE '%admin%'
      ORDER BY nome
    `,
  );

  const groups = (rows || []).map((row) => ({
    id: row.nome,
    nome: row.nome,
  }));

  return groups.length
    ? groups
    : [{ id: "Administradores", nome: "Administradores" }];
}

async function create(req, { login, senhaHash, grupo = "Administradores" }) {
  const columnsMap = await getTableColumnsMap(req, TABLE);
  const insertCols = ["Usuario_Login", "Usuario_Senha"];
  const insertVals = [login, senhaHash];

  const usuarioGrupoCol = pickColumn(columnsMap, ["Usuario_Grupo"]);
  if (usuarioGrupoCol) {
    insertCols.push(usuarioGrupoCol);
    insertVals.push(grupo || "Administradores");
  }

  const firstAccess = firstAccessColumnValues(columnsMap);
  insertCols.push(...firstAccess.columns);
  insertVals.push(...firstAccess.values);

  const placeholders = insertCols.map(() => "?").join(", ");
  const [result] = await dbFor(req).query(
    `INSERT INTO ${TABLE} (${insertCols.join(", ")}) VALUES (${placeholders})`,
    insertVals,
  );

  return findById(req, result.insertId);
}

async function updatePassword(req, id, senhaHash) {
  try {
    const [result] = await dbFor(req).query(
      `UPDATE ${TABLE}
          SET Usuario_Senha = ?, Primeiro_Acesso = 0
        WHERE Usuario_ID = ?`,
      [senhaHash, id],
    );
    return result;
  } catch {
    const [result] = await dbFor(req).query(
      `UPDATE ${TABLE} SET Usuario_Senha = ? WHERE Usuario_ID = ?`,
      [senhaHash, id],
    );
    return result;
  }
}

async function update(req, id, { login, grupo = "Administradores" }) {
  const columnsMap = await getTableColumnsMap(req, TABLE);
  const updates = ["Usuario_Login = ?"];
  const values = [login];

  const usuarioGrupoCol = pickColumn(columnsMap, ["Usuario_Grupo"]);
  if (usuarioGrupoCol) {
    updates.push(`${usuarioGrupoCol} = ?`);
    values.push(grupo || "Administradores");
  }

  values.push(id);

  const [result] = await dbFor(req).query(
    `UPDATE ${TABLE} SET ${updates.join(", ")} WHERE Usuario_ID = ?`,
    values,
  );
  return result;
}

async function remove(req, id) {
  const [result] = await dbFor(req).query(
    `DELETE FROM ${TABLE} WHERE Usuario_ID = ?`,
    [id],
  );
  return result;
}

async function removeAllAdmins(req) {
  const [result] = await dbFor(req).query(
    `DELETE FROM ${TABLE}
      WHERE LOWER(COALESCE(Usuario_Grupo, '')) LIKE '%admin%'`,
  );
  return result;
}

module.exports = {
  TABLE,
  create,
  findById,
  findByLogin,
  listAdminGroups,
  listAdmins,
  remove,
  removeAllAdmins,
  update,
  updatePassword,
};
