const dbFor = require("../utils/dbFor");

async function getTableColumnsMap(req, tableName) {
  const [rows] = await dbFor(req).query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
    `,
    [tableName],
  );

  const map = new Map();
  for (const row of rows || []) {
    const name = String(row.COLUMN_NAME || "");
    if (name) map.set(name.toLowerCase(), name);
  }
  return map;
}

function pickColumn(columnsMap, candidates) {
  for (const candidate of candidates) {
    const found = columnsMap.get(String(candidate).toLowerCase());
    if (found) return found;
  }
  return null;
}

function firstAccessColumnValues(columnsMap) {
  const columns = [];
  const values = [];

  const firstAccessCol = pickColumn(columnsMap, [
    "Primeiro_Acesso",
    "primeiro_acesso",
    "primeiroAcesso",
    "PrimeiroAcesso",
  ]);
  if (firstAccessCol) {
    columns.push(firstAccessCol);
    values.push(1);
  }

  const provisionalCol = pickColumn(columnsMap, [
    "senha_provisoria",
    "senhaProvisoria",
  ]);
  if (provisionalCol) {
    columns.push(provisionalCol);
    values.push(1);
  }

  return { columns, values };
}

async function tableExists(req, tableName) {
  const [rows] = await dbFor(req).query(
    `
      SELECT 1 AS found
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      LIMIT 1
    `,
    [tableName],
  );
  return Boolean(rows && rows.length);
}

module.exports = {
  firstAccessColumnValues,
  getTableColumnsMap,
  pickColumn,
  tableExists,
};
