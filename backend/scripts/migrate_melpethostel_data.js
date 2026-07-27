#!/usr/bin/env node
const mysql = require("mysql2/promise");
const { getDbConfig, publicDbConfig } = require("./lib/dbConfig");

const DEFAULT_MODULE = "melpethostel";
const BATCH_SIZE = 500;
const TABLES = [
  "Usuarios",
  "MelPetHostel_Grupos",
  "MelPetHostel_Usuarios",
  "MelPetHostel_Contratos",
  "MelPetHostel_Documentos_Tipos",
  "MelPetHostel_Documentos",
  "TelegramUsers",
  "TelegramBotConfig",
  "TelegramModuleNotifications",
];
const TELEGRAM_TABLES = new Set([
  "TelegramUsers",
  "TelegramBotConfig",
  "TelegramModuleNotifications",
]);

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function numberFromEnv(name, fallback) {
  const value = clean(process.env[name]);
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} deve ser um numero valido.`);
  }
  return parsed;
}

function getSourceDbConfig() {
  const database = clean(process.env.SOURCE_DB_NAME || process.env.OLD_DB_NAME);
  if (!database) {
    throw new Error(
      "Informe SOURCE_DB_NAME com o nome do banco legado antes da migracao.",
    );
  }

  return {
    host: clean(
      process.env.SOURCE_DB_HOST || process.env.OLD_DB_HOST || process.env.DB_HOST,
    ),
    port: numberFromEnv("SOURCE_DB_PORT", numberFromEnv("DB_PORT", 3306)),
    user: clean(
      process.env.SOURCE_DB_USER || process.env.OLD_DB_USER || process.env.DB_USER,
    ),
    password: clean(
      process.env.SOURCE_DB_PASSWORD ||
        process.env.OLD_DB_PASSWORD ||
        process.env.DB_PASSWORD,
    ),
    database,
    timezone: clean(process.env.SOURCE_DB_TIMEZONE || process.env.DB_TIMEZONE) || "Z",
    connectTimeout: numberFromEnv("SOURCE_DB_CONNECT_TIMEOUT", 10000),
    multipleStatements: false,
  };
}

function quoteId(identifier) {
  return `\`${String(identifier || "").replace(/`/g, "``")}\``;
}

function hasFlag(flag) {
  return process.argv.slice(2).includes(flag);
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT 1 AS found
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      LIMIT 1`,
    [tableName],
  );
  return Boolean(rows && rows.length);
}

async function getColumns(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [tableName],
  );
  return (rows || []).map((row) => String(row.COLUMN_NAME || "")).filter(Boolean);
}

function intersectColumns(sourceColumns, targetColumns) {
  const targetSet = new Set(targetColumns.map((column) => column.toLowerCase()));
  return sourceColumns.filter((column) => targetSet.has(column.toLowerCase()));
}

function getColumnByName(columns, expected) {
  const expectedLower = expected.toLowerCase();
  return columns.find((column) => column.toLowerCase() === expectedLower) || null;
}

async function fetchSourceRows(source, tableName, columns) {
  const columnList = columns.map(quoteId).join(", ");
  const moduleColumn = getColumnByName(columns, "module");
  const where =
    TELEGRAM_TABLES.has(tableName) && moduleColumn
      ? ` WHERE ${quoteId(moduleColumn)} = ?`
      : "";
  const params = where ? [DEFAULT_MODULE] : [];
  const [rows] = await source.query(
    `SELECT ${columnList} FROM ${quoteId(tableName)}${where}`,
    params,
  );
  return rows || [];
}

async function insertRows(target, tableName, columns, rows) {
  if (!rows.length) return 0;

  const moduleColumn = getColumnByName(columns, "module");
  let inserted = 0;
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    const values = batch.map((row) =>
      columns.map((column) => {
        if (moduleColumn && column === moduleColumn && TELEGRAM_TABLES.has(tableName)) {
          return DEFAULT_MODULE;
        }
        return row[column];
      }),
    );

    await target.query(
      `INSERT IGNORE INTO ${quoteId(tableName)}
        (${columns.map(quoteId).join(", ")})
       VALUES ?`,
      [values],
    );
    inserted += batch.length;
  }

  return inserted;
}

async function truncateTargetTables(target) {
  await target.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    for (const tableName of [...TABLES].reverse()) {
      if (!(await tableExists(target, tableName))) continue;
      await target.query(`DELETE FROM ${quoteId(tableName)}`);
      await target.query(`ALTER TABLE ${quoteId(tableName)} AUTO_INCREMENT = 1`);
    }
  } finally {
    await target.query("SET FOREIGN_KEY_CHECKS = 1");
  }
}

async function copyTable(source, target, tableName) {
  const sourceExists = await tableExists(source, tableName);
  const targetExists = await tableExists(target, tableName);

  if (!sourceExists) {
    console.log(`${tableName}: origem nao existe, pulando.`);
    return;
  }

  if (!targetExists) {
    console.log(`${tableName}: destino nao existe, pulando.`);
    return;
  }

  const sourceColumns = await getColumns(source, tableName);
  const targetColumns = await getColumns(target, tableName);
  const columns = intersectColumns(sourceColumns, targetColumns);

  if (!columns.length) {
    console.log(`${tableName}: sem colunas compativeis, pulando.`);
    return;
  }

  const rows = await fetchSourceRows(source, tableName, columns);
  const inserted = await insertRows(target, tableName, columns, rows);
  console.log(`${tableName}: ${inserted} registro(s) copiados.`);
}

async function main() {
  const truncate = hasFlag("--truncate");
  const targetConfig = getDbConfig({ multipleStatements: true });
  const sourceConfig = getSourceDbConfig();

  console.log("Origem:", publicDbConfig(sourceConfig));
  console.log("Destino:", publicDbConfig(targetConfig));

  const source = await mysql.createConnection(sourceConfig);
  const target = await mysql.createConnection(targetConfig);

  try {
    if (truncate) {
      console.log("Limpando tabelas de destino antes da copia...");
      await truncateTargetTables(target);
    }

    for (const tableName of TABLES) {
      await copyTable(source, target, tableName);
    }

    console.log("Migracao concluida.");
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((error) => {
  console.error("Erro na migracao:", error.message || error);
  process.exit(1);
});
