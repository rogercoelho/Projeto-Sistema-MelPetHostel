const dbFor = require("../utils/dbFor");
const { onlyDigits } = require("../utils/brFields");
const { tableExists } = require("./schema");

const TABLE = "Enderecos";

const EDITABLE_COLUMNS = [
  "cliente_id",
  "cep",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "estado",
  "uf",
  "ibge",
  "gia",
  "ddd",
  "siafi",
  "principal",
  "ativo",
];

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function nullable(value) {
  const out = clean(value);
  return out || null;
}

function toDbBoolean(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === true || value === 1 || value === "1") return 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "sim", "s", "yes"].includes(normalized)) return 1;
    if (["false", "nao", "n", "no", "0"].includes(normalized)) return 0;
  }
  return value ? 1 : 0;
}

function maskCep(value) {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function normalize(row) {
  if (!row) return null;

  return {
    id: row.id,
    cliente_id: row.cliente_id,
    cep: row.cep || "",
    logradouro: row.logradouro || "",
    numero: row.numero || "",
    complemento: row.complemento || "",
    bairro: row.bairro || "",
    cidade: row.cidade || "",
    estado: row.estado || "",
    uf: row.uf || "",
    ibge: row.ibge || "",
    gia: row.gia || "",
    ddd: row.ddd || "",
    siafi: row.siafi || "",
    principal: row.principal == 1,
    ativo: row.ativo === undefined || row.ativo === null ? true : row.ativo == 1,
    criado_em: row.criado_em || null,
    atualizado_em: row.atualizado_em || null,
  };
}

function hasAddressData(input = {}) {
  return [
    "cep",
    "logradouro",
    "numero",
    "complemento",
    "bairro",
    "cidade",
    "estado",
    "uf",
  ].some((key) => clean(input[key]));
}

function buildPayload(clienteId, input = {}, index = 0) {
  return {
    cliente_id: clienteId,
    cep: nullable(maskCep(input.cep)),
    logradouro: nullable(input.logradouro),
    numero: nullable(input.numero),
    complemento: nullable(input.complemento),
    bairro: nullable(input.bairro),
    cidade: nullable(input.cidade || input.localidade),
    estado: nullable(input.estado),
    uf: nullable(clean(input.uf).toUpperCase().slice(0, 2)),
    ibge: nullable(input.ibge),
    gia: nullable(input.gia),
    ddd: nullable(input.ddd),
    siafi: nullable(input.siafi),
    principal: toDbBoolean(input.principal, index === 0 ? 1 : 0),
    ativo: toDbBoolean(input.ativo, 1),
  };
}

function getValidationMessage(input = {}) {
  if (!hasAddressData(input)) return "";

  const cepDigits = onlyDigits(input.cep);
  if (cepDigits.length !== 8) return "CEP invalido.";
  if (!clean(input.logradouro)) return "Logradouro e obrigatorio.";
  if (!clean(input.numero)) return "Numero e obrigatorio.";
  if (!clean(input.bairro)) return "Bairro e obrigatorio.";
  if (!clean(input.cidade || input.localidade)) return "Cidade e obrigatoria.";
  if (!/^[A-Za-z]{2}$/.test(clean(input.uf))) return "UF invalida.";
  return "";
}

function getListValidationMessage(addresses = []) {
  for (const address of addresses || []) {
    const message = getValidationMessage(address);
    if (message) return message;
  }
  return "";
}

function normalizeInputList(addresses = []) {
  const filtered = (Array.isArray(addresses) ? addresses : []).filter(
    hasAddressData,
  );
  const hasPrincipal = filtered.some((address) =>
    toDbBoolean(address.principal, 0),
  );

  return filtered.map((address, index) => ({
    ...address,
    principal: hasPrincipal ? address.principal : index === 0,
  }));
}

async function ensureTable(req) {
  return tableExists(req, TABLE);
}

async function listByCliente(req, clienteId) {
  if (!(await ensureTable(req))) return [];

  const [rows] = await dbFor(req).query(
    `SELECT *
       FROM ${TABLE}
      WHERE cliente_id = ?
      ORDER BY principal DESC, id ASC`,
    [clienteId],
  );

  return (rows || []).map(normalize);
}

async function create(req, clienteId, input, index = 0) {
  if (!(await ensureTable(req))) {
    throw new Error("Tabela Enderecos nao encontrada.");
  }

  const payload = buildPayload(clienteId, input, index);
  const columns = EDITABLE_COLUMNS;
  const placeholders = columns.map(() => "?").join(", ");
  const values = columns.map((column) => payload[column]);

  const [result] = await dbFor(req).query(
    `INSERT INTO ${TABLE} (${columns.join(", ")}) VALUES (${placeholders})`,
    values,
  );

  return result.insertId;
}

async function update(req, clienteId, id, input, index = 0) {
  const payload = buildPayload(clienteId, input, index);
  const updates = EDITABLE_COLUMNS.filter((column) => column !== "cliente_id")
    .map((column) => `${column} = ?`);
  const values = EDITABLE_COLUMNS.filter((column) => column !== "cliente_id")
    .map((column) => payload[column]);

  values.push(id, clienteId);
  const [result] = await dbFor(req).query(
    `UPDATE ${TABLE}
        SET ${updates.join(", ")}
      WHERE id = ? AND cliente_id = ?`,
    values,
  );

  return result;
}

async function replaceForCliente(req, clienteId, addresses = []) {
  const nextAddresses = normalizeInputList(addresses);
  if (!(await ensureTable(req))) {
    if (nextAddresses.length) {
      throw new Error("Tabela Enderecos nao encontrada.");
    }
    return [];
  }

  const validationMessage = getListValidationMessage(nextAddresses);
  if (validationMessage) {
    const err = new Error(validationMessage);
    err.status = 400;
    throw err;
  }

  const keptIds = [];

  for (const [index, address] of nextAddresses.entries()) {
    const id = Number(address.id);
    if (id) {
      await update(req, clienteId, id, address, index);
      keptIds.push(id);
    } else {
      const createdId = await create(req, clienteId, address, index);
      keptIds.push(createdId);
    }
  }

  if (keptIds.length) {
    const placeholders = keptIds.map(() => "?").join(", ");
    await dbFor(req).query(
      `DELETE FROM ${TABLE}
        WHERE cliente_id = ? AND id NOT IN (${placeholders})`,
      [clienteId, ...keptIds],
    );
  } else {
    await dbFor(req).query(`DELETE FROM ${TABLE} WHERE cliente_id = ?`, [
      clienteId,
    ]);
  }

  return listByCliente(req, clienteId);
}

module.exports = {
  TABLE,
  getListValidationMessage,
  listByCliente,
  replaceForCliente,
};
