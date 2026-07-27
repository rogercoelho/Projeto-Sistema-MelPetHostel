const dbFor = require("../utils/dbFor");
const {
  firstAccessColumnValues,
  getTableColumnsMap,
  pickColumn,
} = require("./schema");

const TABLE = "MelPetHostel_Usuarios";

async function findByLogin(req, login) {
  const [rows] = await dbFor(req).query(
    `SELECT * FROM ${TABLE} WHERE Usuario_Login = ? LIMIT 1`,
    [login],
  );
  return rows && rows.length ? rows[0] : null;
}

async function findById(req, id) {
  const [rows] = await dbFor(req).query(
    `SELECT * FROM ${TABLE} WHERE Usuario_ID = ? LIMIT 1`,
    [id],
  );
  return rows && rows.length ? rows[0] : null;
}

async function list(req) {
  const columnsMap = await getTableColumnsMap(req, TABLE);
  const hasGrupoId = columnsMap.has("grupo_id");

  let grupoExpr = "NULL AS grupo";
  if (hasGrupoId) {
    grupoExpr = "Grupo_ID AS grupo";
  } else if (columnsMap.has("usuario_grupo")) {
    grupoExpr = "Usuario_Grupo AS grupo";
  }

  const [rows] = await dbFor(req).query(
    `SELECT Usuario_ID AS id,
            Usuario_Login AS login,
            ${grupoExpr},
            Created_At,
            Updated_At
       FROM ${TABLE}
      ORDER BY Usuario_Login`,
  );
  return rows || [];
}

async function create(req, { login, senhaHash, grupoId, grupoNome = null }) {
  const columnsMap = await getTableColumnsMap(req, TABLE);
  const insertCols = ["Usuario_Login", "Usuario_Senha"];
  const insertVals = [login, senhaHash];

  const grupoIdCol = pickColumn(columnsMap, ["Grupo_ID"]);
  const usuarioGrupoCol = !grupoIdCol
    ? pickColumn(columnsMap, ["Usuario_Grupo"])
    : null;
  if (grupoIdCol) {
    insertCols.push(grupoIdCol);
    insertVals.push(grupoId || null);
  } else if (usuarioGrupoCol) {
    insertCols.push(usuarioGrupoCol);
    insertVals.push(grupoNome || null);
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

async function update(req, id, { login, grupoId, grupoNome = null }) {
  const columnsMap = await getTableColumnsMap(req, TABLE);
  const updates = ["Usuario_Login = ?"];
  const values = [login];

  const grupoIdCol = pickColumn(columnsMap, ["Grupo_ID"]);
  const usuarioGrupoCol = pickColumn(columnsMap, ["Usuario_Grupo"]);

  if (grupoIdCol) {
    updates.push(`${grupoIdCol} = ?`);
    values.push(grupoId || null);
    if (usuarioGrupoCol) {
      updates.push(`${usuarioGrupoCol} = NULL`);
    }
  } else if (usuarioGrupoCol) {
    updates.push(`${usuarioGrupoCol} = ?`);
    values.push(grupoNome || null);
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

async function removeByGroup(req, { grupoId, grupoNome }) {
  const columnsMap = await getTableColumnsMap(req, TABLE);
  const hasGrupoId = columnsMap.has("grupo_id");
  const hasUsuarioGrupo = columnsMap.has("usuario_grupo");

  if (hasGrupoId && hasUsuarioGrupo) {
    const [result] = await dbFor(req).query(
      `DELETE FROM ${TABLE} WHERE Grupo_ID = ? OR Usuario_Grupo = ?`,
      [grupoId, grupoNome],
    );
    return result;
  }

  if (hasGrupoId) {
    const [result] = await dbFor(req).query(
      `DELETE FROM ${TABLE} WHERE Grupo_ID = ?`,
      [grupoId],
    );
    return result;
  }

  if (hasUsuarioGrupo) {
    const [result] = await dbFor(req).query(
      `DELETE FROM ${TABLE} WHERE Usuario_Grupo = ?`,
      [grupoNome],
    );
    return result;
  }

  return { affectedRows: 0 };
}

module.exports = {
  TABLE,
  create,
  findById,
  findByLogin,
  list,
  remove,
  removeByGroup,
  update,
  updatePassword,
};
