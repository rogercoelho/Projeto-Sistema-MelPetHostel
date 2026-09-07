const mysql = require("mysql2/promise");

const DB_SESSION_TIME_ZONE = "+00:00";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
  timezone: "Z",
  dateStrings: true,
  connectTimeout: process.env.DB_CONNECT_TIMEOUT
    ? Number(process.env.DB_CONNECT_TIMEOUT)
    : 10000,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

pool.on("connection", (connection) => {
  connection.query(`SET time_zone = '${DB_SESSION_TIME_ZONE}'`, (error) => {
    if (error) {
      console.error("Erro ao configurar time_zone UTC na conexao MySQL:", error);
    }
  });
});

module.exports = pool;
