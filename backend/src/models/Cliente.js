const dbFor = require("../utils/dbFor");
const { cpfDigits, maskBrazilPhone, maskRg } = require("../utils/brFields");
const { tableExists } = require("./schema");

const TABLE = "Clientes";

const EDITABLE_COLUMNS = [
  "nome",
  "cpf",
  "rg",
  "data_nascimento",
  "telefone",
  "whatsapp",
  "email",
  "observacoes",
  "ativo",
];

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function nullable(value) {
  const out = clean(value);
  return out || null;
}

function toDbBoolean(value, fallback = 1) {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === true || value === 1 || value === "1") return 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "sim", "s", "yes"].includes(normalized)) return 1;
    if (["false", "nao", "n", "no", "0"].includes(normalized)) {
      return 0;
    }
  }
  return value ? 1 : 0;
}

function normalize(row) {
  if (!row) return null;

  return {
    id: row.id,
    nome: row.nome || "",
    cpf: row.cpf || "",
    rg: row.rg || "",
    data_nascimento: row.data_nascimento || null,
    telefone: row.telefone || "",
    whatsapp: row.whatsapp || "",
    email: row.email || "",
    observacoes: row.observacoes || "",
    ativo: row.ativo === undefined || row.ativo === null ? true : row.ativo == 1,
    criado_em: row.criado_em || null,
    atualizado_em: row.atualizado_em || null,
  };
}

function buildPayload(input = {}) {
  return {
    nome: clean(input.nome),
    cpf: nullable(cpfDigits(input.cpf)),
    rg: nullable(maskRg(input.rg)),
    data_nascimento: nullable(input.data_nascimento),
    telefone: nullable(maskBrazilPhone(input.telefone)),
    whatsapp: nullable(maskBrazilPhone(input.whatsapp)),
    email: nullable(input.email),
    observacoes: nullable(input.observacoes),
    ativo: toDbBoolean(input.ativo, 1),
  };
}

async function ensureTable(req) {
  return tableExists(req, TABLE);
}

async function findById(req, id) {
  if (!(await ensureTable(req))) return null;

  const [rows] = await dbFor(req).query(
    `SELECT *
       FROM ${TABLE}
      WHERE id = ?
      LIMIT 1`,
    [id],
  );

  return normalize(rows && rows.length ? rows[0] : null);
}

async function create(req, input) {
  if (!(await ensureTable(req))) {
    throw new Error("Tabela Clientes nao encontrada.");
  }

  const payload = buildPayload(input);
  const columns = EDITABLE_COLUMNS;
  const placeholders = columns.map(() => "?").join(", ");
  const values = columns.map((column) => payload[column]);

  const [result] = await dbFor(req).query(
    `INSERT INTO ${TABLE} (${columns.join(", ")}) VALUES (${placeholders})`,
    values,
  );

  return findById(req, result.insertId);
}

async function update(req, id, input) {
  if (!(await ensureTable(req))) {
    throw new Error("Tabela Clientes nao encontrada.");
  }

  const payload = buildPayload(input);
  const updates = [];
  const values = [];

  for (const column of EDITABLE_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(input, column)) {
      updates.push(`${column} = ?`);
      values.push(payload[column]);
    }
  }

  if (!updates.length) return { affectedRows: 0 };

  values.push(id);
  const [result] = await dbFor(req).query(
    `UPDATE ${TABLE} SET ${updates.join(", ")} WHERE id = ?`,
    values,
  );

  return result;
}

module.exports = {
  TABLE,
  buildPayload,
  create,
  findById,
  update,
};
