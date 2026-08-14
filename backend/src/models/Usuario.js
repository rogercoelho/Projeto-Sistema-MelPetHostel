const dbFor = require("../utils/dbFor");
const { getTableColumnsMap, pickColumn, tableExists } = require("./schema");

const TABLE = "Usuarios";
const CLIENT_TABLE = "Clientes";
const GROUP_TABLE = "Grupos";

function qid(identifier) {
  return `\`${String(identifier).replace(/`/g, "``")}\``;
}

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function toDbBoolean(value, fallback = 1) {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === true || value === 1 || value === "1") return 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "sim", "s", "yes"].includes(normalized)) return 1;
    if (["false", "nao", "n", "no", "0"].includes(normalized)) return 0;
  }
  return value ? 1 : 0;
}

async function resolveClientMeta(req) {
  if (!(await tableExists(req, CLIENT_TABLE))) return null;

  const columnsMap = await getTableColumnsMap(req, CLIENT_TABLE);
  const idCol = pickColumn(columnsMap, ["id"]);
  if (!idCol) return null;

  return {
    tableName: CLIENT_TABLE,
    idCol,
    nomeCol: pickColumn(columnsMap, ["nome"]),
    cpfCol: pickColumn(columnsMap, ["cpf"]),
    rgCol: pickColumn(columnsMap, ["rg"]),
    dataNascimentoCol: pickColumn(columnsMap, ["data_nascimento"]),
    telefoneCol: pickColumn(columnsMap, ["telefone"]),
    whatsappCol: pickColumn(columnsMap, ["whatsapp"]),
    emailCol: pickColumn(columnsMap, ["email"]),
    observacoesCol: pickColumn(columnsMap, ["observacoes"]),
    ativoCol: pickColumn(columnsMap, ["ativo"]),
    criadoEmCol: pickColumn(columnsMap, ["criado_em"]),
    atualizadoEmCol: pickColumn(columnsMap, ["atualizado_em"]),
  };
}

async function resolveGroupMeta(req) {
  if (!(await tableExists(req, GROUP_TABLE))) return null;

  const columnsMap = await getTableColumnsMap(req, GROUP_TABLE);
  const idCol = pickColumn(columnsMap, ["id", "Grupo_ID"]);
  const nomeCol = pickColumn(columnsMap, ["Nome_Grupo", "Grupo_Nome", "nome"]);
  const acessoCol = pickColumn(columnsMap, ["Acesso", "acesso"]);
  if (!idCol || !nomeCol) return null;

  return { tableName: GROUP_TABLE, idCol, nomeCol, acessoCol };
}

async function resolveMeta(req) {
  if (!(await tableExists(req, TABLE))) return null;

  const columnsMap = await getTableColumnsMap(req, TABLE);
  const idCol = pickColumn(columnsMap, ["Usuario_ID", "usuario_id", "id"]);
  const loginCol = pickColumn(columnsMap, ["Usuario_Login", "usuario_login", "login"]);
  const passwordCol = pickColumn(columnsMap, ["Usuario_Senha", "usuario_senha", "senha"]);
  const groupIdCol = pickColumn(columnsMap, ["Grupo_ID", "grupo_id", "grupo"]);

  if (!idCol || !loginCol || !passwordCol || !groupIdCol) return null;

  return {
    tableName: TABLE,
    idCol,
    loginCol,
    passwordCol,
    clienteIdCol: pickColumn(columnsMap, ["Cliente_ID", "cliente_id", "clienteId"]),
    firstAccessCol: pickColumn(columnsMap, [
      "Primeiro_Acesso",
      "primeiro_acesso",
      "primeiroAcesso",
      "PrimeiroAcesso",
    ]),
    activeCol: pickColumn(columnsMap, ["Ativo", "ativo"]),
    createdAtCol: pickColumn(columnsMap, ["Created_At", "created_at"]),
    updatedAtCol: pickColumn(columnsMap, ["Updated_At", "updated_at"]),
    groupIdCol,
    client: await resolveClientMeta(req),
    group: await resolveGroupMeta(req),
  };
}

function aliased(column, alias, tableAlias = "u", fallback = "NULL") {
  if (!column) return `${fallback} AS ${alias}`;
  return `${tableAlias}.${qid(column)} AS ${alias}`;
}

function buildSelect(meta, { includePassword = true } = {}) {
  const fields = [
    aliased(meta.idCol, "usuario_id"),
    aliased(meta.clienteIdCol, "cliente_id"),
    aliased(meta.loginCol, "usuario_login"),
    aliased(meta.firstAccessCol, "primeiro_acesso", "u", "0"),
    aliased(meta.activeCol, "ativo", "u", "1"),
    aliased(meta.createdAtCol, "created_at"),
    aliased(meta.updatedAtCol, "updated_at"),
    aliased(meta.groupIdCol, "grupo_id"),
  ];

  if (includePassword) {
    fields.splice(3, 0, aliased(meta.passwordCol, "usuario_senha"));
  }

  if (meta.client && meta.clienteIdCol) {
    fields.push(
      aliased(meta.client.idCol, "cliente_ref_id", "c"),
      aliased(meta.client.nomeCol, "cliente_nome", "c"),
      aliased(meta.client.cpfCol, "cliente_cpf", "c"),
      aliased(meta.client.rgCol, "cliente_rg", "c"),
      aliased(meta.client.dataNascimentoCol, "cliente_data_nascimento", "c"),
      aliased(meta.client.telefoneCol, "cliente_telefone", "c"),
      aliased(meta.client.whatsappCol, "cliente_whatsapp", "c"),
      aliased(meta.client.emailCol, "cliente_email", "c"),
      aliased(meta.client.observacoesCol, "cliente_observacoes", "c"),
      aliased(meta.client.ativoCol, "cliente_ativo", "c", "1"),
      aliased(meta.client.criadoEmCol, "cliente_criado_em", "c"),
      aliased(meta.client.atualizadoEmCol, "cliente_atualizado_em", "c"),
    );
  }

  if (meta.group && meta.groupIdCol) {
    fields.push(
      aliased(meta.group.idCol, "grupo_ref_id", "g"),
      aliased(meta.group.nomeCol, "grupo_nome", "g"),
      aliased(meta.group.acessoCol, "grupo_acesso", "g"),
    );
  }

  return fields.join(",\n");
}

function buildJoins(meta) {
  const joins = [];
  if (meta.client && meta.clienteIdCol) {
    joins.push(`LEFT JOIN ${qid(meta.client.tableName)} c
            ON c.${qid(meta.client.idCol)} = u.${qid(meta.clienteIdCol)}`);
  }
  if (meta.group && meta.groupIdCol) {
    joins.push(`LEFT JOIN ${qid(meta.group.tableName)} g
            ON g.${qid(meta.group.idCol)} = u.${qid(meta.groupIdCol)}`);
  }
  return joins.join("\n");
}

function clienteFromRow(row) {
  if (!row || !row.cliente_ref_id) return null;

  return {
    id: row.cliente_ref_id,
    nome: row.cliente_nome || "",
    cpf: row.cliente_cpf || "",
    rg: row.cliente_rg || "",
    data_nascimento: row.cliente_data_nascimento || null,
    telefone: row.cliente_telefone || "",
    whatsapp: row.cliente_whatsapp || "",
    email: row.cliente_email || "",
    observacoes: row.cliente_observacoes || "",
    ativo:
      row.cliente_ativo === undefined || row.cliente_ativo === null
        ? true
        : row.cliente_ativo == 1,
    criado_em: row.cliente_criado_em || null,
    atualizado_em: row.cliente_atualizado_em || null,
  };
}

function normalize(row) {
  if (!row) return null;

  const id = row.usuario_id ?? row.Usuario_ID ?? row.id;
  const login = row.usuario_login ?? row.Usuario_Login ?? row.login;
  const senha = row.usuario_senha ?? row.Usuario_Senha;
  const grupoId = row.grupo_id ?? row.Grupo_ID ?? row.grupo;
  const grupoNome = row.grupo_nome ?? row.Grupo_Nome ?? row.grupoNome ?? null;
  const grupoAcesso = row.grupo_acesso ?? row.Grupo_Acesso ?? row.grupoAcesso ?? null;
  const clienteId = row.cliente_id ?? row.Cliente_ID ?? row.clienteId ?? null;
  const primeiroAcesso = row.primeiro_acesso ?? row.Primeiro_Acesso ?? 0;
  const ativo = row.ativo === undefined || row.ativo === null ? 1 : row.ativo;

  return {
    ...row,
    id,
    login,
    grupo: grupoId,
    grupoNome,
    grupoAcesso,
    clienteId,
    cliente: clienteFromRow(row),
    primeiroAcesso: primeiroAcesso == 1,
    ativo: ativo == 1,
    Usuario_ID: id,
    Usuario_Login: login,
    Usuario_Senha: senha,
    Primeiro_Acesso: primeiroAcesso,
    Grupo_ID: grupoId,
    Grupo_Nome: grupoNome,
    Grupo_Acesso: grupoAcesso,
    Cliente_ID: clienteId,
  };
}

async function findByLogin(req, login) {
  const meta = await resolveMeta(req);
  if (!meta) return null;

  const [rows] = await dbFor(req).query(
    `SELECT ${buildSelect(meta)}
       FROM ${qid(meta.tableName)} u
       ${buildJoins(meta)}
      WHERE u.${qid(meta.loginCol)} = ?
      LIMIT 1`,
    [login],
  );

  return normalize(rows && rows.length ? rows[0] : null);
}

async function findById(req, id) {
  const meta = await resolveMeta(req);
  if (!meta) return null;

  const [rows] = await dbFor(req).query(
    `SELECT ${buildSelect(meta)}
       FROM ${qid(meta.tableName)} u
       ${buildJoins(meta)}
      WHERE u.${qid(meta.idCol)} = ?
      LIMIT 1`,
    [id],
  );

  return normalize(rows && rows.length ? rows[0] : null);
}

async function list(req) {
  const meta = await resolveMeta(req);
  if (!meta) return [];

  const [rows] = await dbFor(req).query(
    `SELECT ${buildSelect(meta, { includePassword: false })}
       FROM ${qid(meta.tableName)} u
       ${buildJoins(meta)}
      ORDER BY u.${qid(meta.loginCol)}`,
  );

  return (rows || []).map(normalize);
}

async function findByGroup(req, grupoId) {
  const meta = await resolveMeta(req);
  if (!meta) return [];

  const [rows] = await dbFor(req).query(
    `SELECT ${buildSelect(meta)}
       FROM ${qid(meta.tableName)} u
       ${buildJoins(meta)}
      WHERE u.${qid(meta.groupIdCol)} = ?
      ORDER BY u.${qid(meta.loginCol)}`,
    [grupoId],
  );

  return (rows || []).map(normalize);
}

async function create(
  req,
  {
    login,
    senhaHash,
    grupoId,
    clienteId = null,
    primeiroAcesso = 1,
    ativo = 1,
  },
) {
  const meta = await resolveMeta(req);
  if (!meta) {
    throw new Error("Tabela Usuarios nao encontrada.");
  }

  const insertCols = [];
  const insertVals = [];

  function push(column, value) {
    if (!column) return;
    insertCols.push(qid(column));
    insertVals.push(value);
  }

  push(meta.clienteIdCol, clienteId || null);
  push(meta.loginCol, clean(login));
  push(meta.passwordCol, senhaHash);
  push(meta.firstAccessCol, toDbBoolean(primeiroAcesso, 1));
  push(meta.activeCol, toDbBoolean(ativo, 1));
  push(meta.groupIdCol, grupoId || null);

  const placeholders = insertCols.map(() => "?").join(", ");
  const [result] = await dbFor(req).query(
    `INSERT INTO ${qid(meta.tableName)}
      (${insertCols.join(", ")})
     VALUES (${placeholders})`,
    insertVals,
  );

  return findById(req, result.insertId);
}

async function update(req, id, { login, grupoId, clienteId, ativo }) {
  const meta = await resolveMeta(req);
  if (!meta) return { affectedRows: 0 };

  const updates = [`${qid(meta.loginCol)} = ?`];
  const values = [clean(login)];

  updates.push(`${qid(meta.groupIdCol)} = ?`);
  values.push(grupoId || null);

  if (meta.clienteIdCol) {
    updates.push(`${qid(meta.clienteIdCol)} = ?`);
    values.push(clienteId || null);
  }

  if (ativo !== undefined && meta.activeCol) {
    updates.push(`${qid(meta.activeCol)} = ?`);
    values.push(toDbBoolean(ativo, 1));
  }

  values.push(id);
  const [result] = await dbFor(req).query(
    `UPDATE ${qid(meta.tableName)}
        SET ${updates.join(", ")}
      WHERE ${qid(meta.idCol)} = ?`,
    values,
  );

  return result;
}

async function updatePassword(req, id, senhaHash, { primeiroAcesso } = {}) {
  const meta = await resolveMeta(req);
  if (!meta) return { affectedRows: 0 };

  const updates = [`${qid(meta.passwordCol)} = ?`];
  const values = [senhaHash];

  if (primeiroAcesso !== undefined && meta.firstAccessCol) {
    updates.push(`${qid(meta.firstAccessCol)} = ?`);
    values.push(toDbBoolean(primeiroAcesso, 0));
  }

  values.push(id);
  const [result] = await dbFor(req).query(
    `UPDATE ${qid(meta.tableName)}
        SET ${updates.join(", ")}
      WHERE ${qid(meta.idCol)} = ?`,
    values,
  );

  return result;
}

async function remove(req, id) {
  const meta = await resolveMeta(req);
  if (!meta) return { affectedRows: 0 };

  const [result] = await dbFor(req).query(
    `DELETE FROM ${qid(meta.tableName)} WHERE ${qid(meta.idCol)} = ?`,
    [id],
  );

  return result;
}

async function removeByGroup(req, grupoId) {
  const meta = await resolveMeta(req);
  if (!meta) return { affectedRows: 0 };

  const [result] = await dbFor(req).query(
    `DELETE FROM ${qid(meta.tableName)} WHERE ${qid(meta.groupIdCol)} = ?`,
    [grupoId],
  );

  return result;
}

module.exports = {
  TABLE,
  create,
  findByGroup,
  findById,
  findByLogin,
  list,
  remove,
  removeByGroup,
  update,
  updatePassword,
};
