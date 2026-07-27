#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const { getDbConfig, publicDbConfig } = require("./lib/dbConfig");

const DEFAULT_SQL_FILE = "create_melpethostel_schema.sql";

function resolveSqlFile(fileArg = DEFAULT_SQL_FILE) {
  const filePath = path.resolve(__dirname, fileArg);
  const relative = path.relative(__dirname, filePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Informe um arquivo SQL dentro da pasta scripts.");
  }

  if (path.extname(filePath).toLowerCase() !== ".sql") {
    throw new Error("Informe um arquivo com extensao .sql.");
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo SQL nao encontrado: ${filePath}`);
  }

  return filePath;
}

function normalizeSql(sqlRaw) {
  return sqlRaw
    .replace(/^\s*DELIMITER .*$/gim, "")
    .replace(/\$\$/g, ";")
    .trim();
}

async function main() {
  const filePath = resolveSqlFile(process.argv[2]);
  const sql = normalizeSql(fs.readFileSync(filePath, "utf8"));

  if (!sql) {
    throw new Error(`Arquivo SQL vazio: ${filePath}`);
  }

  const config = getDbConfig({ multipleStatements: true });
  const connection = await mysql.createConnection(config);

  try {
    console.log("Executando SQL:", path.basename(filePath));
    console.log("Banco:", publicDbConfig(config));
    await connection.query(sql);
    console.log("SQL executado com sucesso.");
  } catch (error) {
    console.error("Erro executando SQL:", error.message || error);
    process.exitCode = 2;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Erro:", error.message || error);
  process.exit(1);
});
