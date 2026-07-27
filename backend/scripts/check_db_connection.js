#!/usr/bin/env node
const mysql = require("mysql2/promise");
const { getDbConfig, publicDbConfig } = require("./lib/dbConfig");

function explainError(error) {
  switch (error.code) {
    case "ECONNREFUSED":
      return "Conexao recusada. DB_HOST/DB_PORT apontam para um host sem MySQL aceitando conexao nessa porta.";
    case "ETIMEDOUT":
      return "Timeout. Se estiver conectando de fora do cPanel, libere o IP em Remote MySQL ou use o host/IP correto.";
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "Host nao encontrado. Confira DB_HOST.";
    case "ER_ACCESS_DENIED_ERROR":
      return "Usuario/senha incorretos ou usuario sem permissao no banco. No cPanel, adicione o usuario ao banco com All Privileges.";
    case "ER_BAD_DB_ERROR":
      return "Banco nao existe ou o nome em DB_NAME esta diferente do nome criado no cPanel.";
    default:
      return "Erro nao mapeado. Use code/errno/sqlState abaixo para diagnosticar no provedor.";
  }
}

async function main() {
  const config = getDbConfig();

  console.log("Testando conexao MySQL com:");
  console.log(publicDbConfig(config));

  let connection;
  try {
    connection = await mysql.createConnection(config);
    const [rows] = await connection.query(
      "SELECT DATABASE() AS db, CURRENT_USER() AS currentUser, VERSION() AS version",
    );
    const info = rows && rows[0] ? rows[0] : {};

    console.log("Conexao OK:");
    console.log({
      database: info.db,
      currentUser: info.currentUser,
      version: info.version,
    });
  } catch (error) {
    console.error("Falha na conexao:");
    console.error({
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      message: error.message,
    });
    console.error("Diagnostico:", explainError(error));
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end();
  }
}

main().catch((error) => {
  console.error("Erro inesperado:", error.message || error);
  process.exit(1);
});
