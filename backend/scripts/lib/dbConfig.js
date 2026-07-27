require("dotenv").config();

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

function getDbConfig({ multipleStatements = false } = {}) {
  const config = {
    host: clean(process.env.DB_HOST),
    port: numberFromEnv("DB_PORT", 3306),
    user: clean(process.env.DB_USER),
    password: clean(process.env.DB_PASSWORD),
    database: clean(process.env.DB_NAME),
    timezone: clean(process.env.DB_TIMEZONE) || "Z",
    connectTimeout: numberFromEnv("DB_CONNECT_TIMEOUT", 10000),
    multipleStatements,
  };

  const missing = [];
  if (!config.host) missing.push("DB_HOST");
  if (!config.user) missing.push("DB_USER");
  if (!config.database) missing.push("DB_NAME");

  if (missing.length) {
    throw new Error(`Variaveis de banco ausentes: ${missing.join(", ")}`);
  }

  return config;
}

function mask(value, visible = 2) {
  const text = clean(value);
  if (!text) return "(vazio)";
  if (text.length <= visible * 2) return "*".repeat(text.length);

  const hiddenCount = Math.max(3, text.length - visible * 2);
  return `${text.slice(0, visible)}${"*".repeat(hiddenCount)}${text.slice(-visible)}`;
}

function publicDbConfig(config) {
  return {
    host: config.host || "(vazio)",
    port: config.port,
    user: mask(config.user, 4),
    database: config.database || "(vazio)",
    timezone: config.timezone,
  };
}

module.exports = {
  getDbConfig,
  publicDbConfig,
};
