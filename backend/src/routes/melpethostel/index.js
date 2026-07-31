const express = require("express");
const router = express.Router();
const db = require("../../config/database");
const path = require("path");
const fs = require("fs").promises;
const bcrypt = require("bcryptjs");
const multer = require("multer");
const {
  getModuleAccessNotificationConfig,
  getTelegramChatIdByLogin,
  normalizeModule,
  sendTelegram,
} = require("../../services/telegramService");
const { Endereco, Grupo, Usuario } = require("../../models");
const { getClienteCadastroStatus } = require("../../utils/clientProfile");

const uploadsRootDefault =
  process.env.UPLOADS_ROOT || path.resolve(__dirname, "../../../uploads");
const uploadContrato = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const TABLE_NAMES = Object.freeze({
  contratos: "Contratos",
  documentos: "Documentos",
  documentosTipo: "Documentos_Tipo",
  pets: "Pets",
  petFichas: "Pet_Fichas",
});

const DEFAULT_DOCUMENT_TYPES = Object.freeze([
  { id: 1, nome: "Documento de Identificacao" },
  { id: 2, nome: "Comprovante de Endereco" },
  { id: 3, nome: "Outros Documentos" },
]);

router.use("/telegram", require("./telegram"));

function dbFor(req) {
  return req && req.db ? req.db : db;
}

function qcol(name) {
  return `\`${String(name || "").replace(/`/g, "")}\``;
}

function qtable(name) {
  return qcol(name);
}

async function resolveTableName(req, preferredName) {
  const [rows] = await dbFor(req).query(
    `
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?)
      ORDER BY CASE WHEN TABLE_NAME = ? THEN 0 ELSE 1 END
      LIMIT 1
    `,
    [preferredName, preferredName],
  );

  return rows && rows.length ? rows[0].TABLE_NAME : null;
}

function sanitizePart(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/\\\\:?"<>|*]/g, "-")
    .replace(/\s+/g, "_");
}

function normalizeUploadsDir(rawPath) {
  const raw = String(rawPath || "")
    .trim()
    .replace(/\\/g, "/");
  if (!raw) return null;
  const cleaned = raw.replace(/^\/?(?:melpethostel\/)?uploads\/?/i, "");
  const parts = cleaned.split("/").filter(Boolean).map(sanitizePart);
  if (!parts.length) return "/uploads";
  return "/uploads/" + parts.join("/");
}

function toPublicUploadPath(rawPath) {
  const raw = String(rawPath || "")
    .trim()
    .replace(/\\/g, "/");
  if (!raw) return null;
  const cleaned = raw.replace(/^\/?(?:melpethostel\/)?uploads\/?/i, "");
  const parts = cleaned.split("/").filter(Boolean).map(sanitizePart);
  if (!parts.length) return null;
  return `/melpethostel/uploads/${parts.join("/")}`;
}

function resolveUploadsDirToDisk(relativeDir) {
  const cleaned = String(relativeDir || "")
    .replace(/^\/?(?:melpethostel\/)?uploads\/?/i, "")
    .replace(/\\/g, "/");
  const parts = cleaned.split("/").filter(Boolean).map(sanitizePart);
  const root = path.resolve(uploadsRootDefault);
  const abs = path.resolve(path.join(uploadsRootDefault, ...parts));
  if (!abs.startsWith(root)) {
    throw new Error("Caminho de upload inválido");
  }
  return abs;
}

function resolveUploadsFileToDisk(rawPath) {
  const cleaned = String(rawPath || "")
    .replace(/^\/?(?:melpethostel\/)?uploads\/?/i, "")
    .replace(/\\/g, "/");
  const parts = cleaned.split("/").filter(Boolean).map(sanitizePart);
  const root = path.resolve(uploadsRootDefault);
  const abs = path.resolve(path.join(uploadsRootDefault, ...parts));
  if (!abs.startsWith(root)) {
    throw new Error("Caminho de upload inválido");
  }
  return abs;
}

function pickColumn(columnsLowerMap, candidates) {
  for (const c of candidates) {
    const found = columnsLowerMap.get(String(c).toLowerCase());
    if (found) return found;
  }
  return null;
}

function isTruthyFlag(value) {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return ["1", "true", "sim", "yes", "conferido", "aprovado", "ok"].includes(
      v,
    );
  }
  return false;
}

function isValidDbDate(value) {
  if (value == null) return false;

  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }

  const text = String(value).trim();
  if (!text) return false;
  if (/^0{4}-0{2}-0{2}(?:[ T]0{2}:0{2}:0{2}(?:\.0+)?)?$/.test(text)) {
    return false;
  }

  const parsed = new Date(text);
  return !Number.isNaN(parsed.getTime());
}

async function getContratosTableMeta(req) {
  const tableName = await resolveTableName(req, TABLE_NAMES.contratos);
  if (!tableName) {
    return {
      exists: false,
      tableName: TABLE_NAMES.contratos,
      columnsLowerMap: new Map(),
    };
  }

  const [rows] = await dbFor(req).query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
    `,
    [tableName],
  );

  const columnsLowerMap = new Map();
  for (const r of rows || []) {
    const n = String(r.COLUMN_NAME || "");
    if (n) columnsLowerMap.set(n.toLowerCase(), n);
  }

  return {
    exists: columnsLowerMap.size > 0,
    tableName,
    columnsLowerMap,
    idCol: pickColumn(columnsLowerMap, [
      "Contrato_ID",
      "contrato_id",
      "ID",
      "Id",
      "id",
    ]),
    loginCol: pickColumn(columnsLowerMap, [
      "Usuario_Login",
      "usuario_login",
      "Login",
      "login",
      "Usuario",
      "usuario",
      "User_Login",
      "user_login",
    ]),
    nomeArquivoCol: pickColumn(columnsLowerMap, [
      "Nome_Arquivo",
      "nome_arquivo",
      "NomeArquivo",
      "nomeArquivo",
      "Nome_Documento",
      "nome_documento",
      "File_Name",
      "file_name",
      "Arquivo",
      "arquivo",
      "Arquivo_Nome",
      "arquivo_nome",
    ]),
    filePathCol: pickColumn(columnsLowerMap, [
      "File_Path",
      "file_path",
      "FilePath",
      "filePath",
      "Path",
      "path",
      "Caminho",
      "caminho",
      "Caminho_Arquivo",
      "caminho_arquivo",
    ]),
    conferidoCol: pickColumn(columnsLowerMap, [
      "Conferido",
      "Contrato_Conferido",
      "Conferido_Flag",
      "Vali" + "dado",
      "Checked",
    ]),
    conferidoAtCol: pickColumn(columnsLowerMap, [
      "Conferido_At",
      "Conferido_Em",
      "Checked_At",
      "Data_Conferencia",
    ]),
    conferidoPorCol: pickColumn(columnsLowerMap, [
      "Conferido_Por",
      "ConferidoPor",
      "Checked_By",
    ]),
    statusCol: pickColumn(columnsLowerMap, ["Status", "Contrato_Status"]),
    updatedAtCol: pickColumn(columnsLowerMap, [
      "Updated_At",
      "updated_at",
      "UpdatedAt",
      "updatedAt",
      "atualizado_em",
    ]),
  };
}

async function getLatestContratoRow(req, meta, login) {
  if (!meta.exists || !meta.loginCol) return null;

  const selectCols = [meta.loginCol, meta.nomeArquivoCol, meta.filePathCol]
    .concat(
      [
        meta.idCol,
        meta.conferidoCol,
        meta.conferidoAtCol,
        meta.conferidoPorCol,
        meta.statusCol,
        meta.updatedAtCol,
      ].filter(Boolean),
    )
    .filter(Boolean);

  const uniqueCols = [...new Set(selectCols)];
  const orderCol = meta.updatedAtCol || meta.idCol || meta.loginCol;

  const sql = `
    SELECT ${uniqueCols.map(qcol).join(", ")}
    FROM ${qtable(meta.tableName)}
    WHERE ${qcol(meta.loginCol)} = ?
    ORDER BY ${qcol(orderCol)} DESC
    LIMIT 1
  `;

  const [rows] = await dbFor(req).query(sql, [login]);
  return rows && rows.length ? rows[0] : null;
}

async function fileExistsOnDisk(filePath, nomeArquivo) {
  const rawDir = normalizeUploadsDir(filePath);
  if (!rawDir || !nomeArquivo) return false;

  try {
    const baseDir = resolveUploadsDirToDisk(rawDir);
    const fullFile = path.join(baseDir, String(nomeArquivo));
    const root = path.resolve(uploadsRootDefault);
    const resolved = path.resolve(fullFile);
    if (!resolved.startsWith(root)) return false;
    await fs.access(resolved);
    return true;
  } catch {
    return false;
  }
}

async function fileExistsByStoredPath(filePath) {
  const raw = String(filePath || "").trim();
  if (!raw) return false;
  try {
    const abs = resolveUploadsFileToDisk(raw);
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}

function getReqLogin(req) {
  return (
    (req && req.user && req.user.login) ||
    (req && req.headers && req.headers["x-user"]) ||
    null
  );
}

function toText(value) {
  return String(value ?? "").trim();
}

function toJsonText(value) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function getCurrentClienteId(req) {
  const login = getReqLogin(req);
  if (!login) return null;

  const usuario = await Usuario.findByLogin(req, login);
  const clienteId =
    usuario?.cliente_id ?? usuario?.Cliente_ID ?? usuario?.clienteId ?? null;

  return clienteId ? Number(clienteId) : null;
}

function normalizeDocumentUser(row) {
  if (!row) return null;

  const id = row.Usuario_ID ?? row.usuario_id ?? row.id;
  const login = row.Usuario_Login ?? row.usuario_login ?? row.login;
  const grupoId = row.Grupo_ID ?? row.grupo_id ?? row.grupo;

  if (!id || !login) return null;

  return {
    ...row,
    Usuario_ID: id,
    Usuario_Login: login,
    Grupo_ID: grupoId || null,
  };
}

async function getUsuarioByLogin(req, login) {
  return normalizeDocumentUser(await Usuario.findByLogin(req, login));
}

async function getUsuarioById(req, id) {
  return normalizeDocumentUser(await Usuario.findById(req, id));
}

async function listUsuariosForDocuments(req) {
  const usuarios = ((await Usuario.list(req)) || [])
    .map(normalizeDocumentUser)
    .filter(Boolean);

  return usuarios.sort((a, b) =>
    String(a.Usuario_Login).localeCompare(String(b.Usuario_Login)),
  );
}

function isNumericId(value) {
  return /^\d+$/.test(String(value || "").trim());
}

async function getGroupNameById(req, grupoId) {
  if (!isNumericId(grupoId)) return null;

  const grupo = await Grupo.findById(req, Number(grupoId));
  return grupo?.Grupo_Nome || grupo?.nome || null;
}

const MODULE = normalizeModule("melpethostel");

async function notifyModuleAccess(req) {
  const login = getReqLogin(req);
  if (!login) return { notified: false, reason: "sem_usuario" };

  const db = dbFor(req);
  const config = await getModuleAccessNotificationConfig(MODULE, db);
  if (!config.enabled || !config.adminLogins || !config.adminLogins.length) {
    return { notified: false, reason: "desativado" };
  }

  const safeLogin = sanitizePart(login);
  const message = `Modulo Mel Pet Hostel\nO usuário <b>${safeLogin}</b> acessou o Módulo Mel Pet Hostel.`;

  const notifiedTo = [];
  for (const adminLogin of config.adminLogins) {
    const chatId =
      (config.adminChatIds && config.adminChatIds[adminLogin]) ||
      (await getTelegramChatIdByLogin(MODULE, adminLogin, db));
    if (!chatId) continue;
    try {
      await sendTelegram(chatId, message, { module: MODULE });
      notifiedTo.push({ adminLogin, chatId });
    } catch (e) {
      console.error(
        "notifyModuleAccess error sending to",
        adminLogin,
        e && e.message ? e.message : e,
      );
    }
  }

  return {
    notified: !!notifiedTo.length,
    notifiedTo,
  };
}

function getReqGrupo(req) {
  return (
    (req && req.user && req.user.grupoNome) ||
    (req && req.user && req.user.grupo) ||
    null
  );
}

async function resolveGroupNameForUser(req, login) {
  const fromToken = getReqGrupo(req);
  if (fromToken && String(fromToken).trim()) {
    if (isNumericId(fromToken)) {
      const groupName = await getGroupNameById(req, fromToken);
      return groupName ? sanitizePart(groupName) : null;
    }
    return sanitizePart(fromToken);
  }

  const userRow = await getUsuarioByLogin(req, login);
  const groupName = userRow
    ? await getGroupNameById(req, userRow.Grupo_ID)
    : null;
  return groupName ? sanitizePart(groupName) : null;
}

function isAdminGroupValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .includes("admin");
}

async function isAdminUser(req, login) {
  const fromToken = getReqGrupo(req);
  if (isAdminGroupValue(fromToken)) return true;

  const resolvedGroup = await resolveGroupNameForUser(req, login);
  return isAdminGroupValue(resolvedGroup);
}

function isNewUsuariosSource(req) {
  return req?.user?.source === "usuarios";
}

async function getClienteCadastroStatusByLogin(req, login) {
  const usuario = await Usuario.findByLogin(req, login);
  if (!usuario || !usuario.cliente) {
    return getClienteCadastroStatus(null, []);
  }

  const enderecos = await Endereco.listByCliente(
    req,
    usuario.Cliente_ID || usuario.clienteId,
  );
  return getClienteCadastroStatus(usuario.cliente, enderecos);
}

async function requireCompleteClienteCadastro(req, res, login) {
  if (!isNewUsuariosSource(req) || (await isAdminUser(req, login))) {
    return true;
  }

  const cadastro = await getClienteCadastroStatusByLogin(req, login);
  if (!cadastro.pendente) return true;

  res.status(400).json({
    status: "erro",
    mensagem: "Complete os dados cadastrais antes de continuar.",
    pendencias: cadastro.pendencias,
  });
  return false;
}

async function resolveUserDocumentsRelativeDir(req, login) {
  const safeUsuario = sanitizePart(login) || "usuario";

  if (await isAdminUser(req, login)) {
    return {
      relativeDir: `/uploads/Administradores/${safeUsuario}`,
      safeUsuario,
    };
  }

  const safeGrupo = await resolveGroupNameForUser(req, login);
  if (!safeGrupo) {
    return null;
  }

  return {
    relativeDir: `/uploads/${safeGrupo}/${safeUsuario}/Documentos`,
    safeUsuario,
  };
}

async function ensureDocumentoTiposSeeded(req) {
  const tableName = await resolveTableName(req, TABLE_NAMES.documentosTipo);
  if (!tableName) {
    throw new Error(`Tabela ${TABLE_NAMES.documentosTipo} nao encontrada.`);
  }

  for (const tipo of DEFAULT_DOCUMENT_TYPES) {
    await dbFor(req).query(
      `INSERT IGNORE INTO ${qtable(tableName)}
        (Id, Documento_Tipo)
       VALUES (?, ?)`,
      [tipo.id, tipo.nome],
    );
  }
}

function normalizeDocumentoTipo(row) {
  if (!row) return null;

  const id = row.Id ?? row.id;
  const nome =
    row.Documento_Tipo ?? row.documento_tipo ?? row.nome ?? row.Nome ?? "";

  if (!id || !nome) return null;

  return {
    ...row,
    Id: id,
    Documento_Tipo: nome,
    key: mapRequiredDocKey(nome),
  };
}

async function getDocumentoTipos(req) {
  await ensureDocumentoTiposSeeded(req);
  const tableName = await resolveTableName(req, TABLE_NAMES.documentosTipo);

  const [rows] = await dbFor(req).query(
    `SELECT Id, Documento_Tipo
       FROM ${qtable(tableName)}
      ORDER BY Id`,
  );
  return (rows || []).map(normalizeDocumentoTipo).filter(Boolean);
}

async function getDocumentoTipoById(req, id) {
  await ensureDocumentoTiposSeeded(req);
  const tableName = await resolveTableName(req, TABLE_NAMES.documentosTipo);

  const [rows] = await dbFor(req).query(
    `SELECT Id, Documento_Tipo
       FROM ${qtable(tableName)}
      WHERE Id = ?
      LIMIT 1`,
    [id],
  );
  return normalizeDocumentoTipo(rows && rows.length ? rows[0] : null);
}

async function getDocumentosTableMeta(req) {
  const tableName = await resolveTableName(req, TABLE_NAMES.documentos);
  if (!tableName) {
    return {
      exists: false,
      tableName: TABLE_NAMES.documentos,
      columnsLowerMap: new Map(),
    };
  }

  const [rows] = await dbFor(req).query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
    `,
    [tableName],
  );

  const columnsLowerMap = new Map();
  for (const r of rows || []) {
    const n = String(r.COLUMN_NAME || "");
    if (n) columnsLowerMap.set(n.toLowerCase(), n);
  }

  return {
    exists: columnsLowerMap.size > 0,
    tableName,
    columnsLowerMap,
    idCol: pickColumn(columnsLowerMap, ["Id", "ID", "id"]),
    usuarioIdCol: pickColumn(columnsLowerMap, [
      "Usuario_ID",
      "usuario_id",
      "UsuarioId",
      "usuarioId",
    ]),
    contratoIdCol: pickColumn(columnsLowerMap, [
      "Contrato_ID",
      "contrato_id",
      "ContratoId",
      "contratoId",
    ]),
    tipoIdCol: pickColumn(columnsLowerMap, [
      "Documento_Tipo_ID",
      "documento_tipo_id",
      "DocumentoTipoId",
      "documentoTipoId",
    ]),
    filePathCol: pickColumn(columnsLowerMap, [
      "File_Path",
      "file_path",
      "FilePath",
      "filePath",
      "Caminho",
      "caminho",
    ]),
    conferidoCol: pickColumn(columnsLowerMap, [
      "Conferido",
      "conferido",
      "Checked",
      "checked",
    ]),
    conferidoAtCol: pickColumn(columnsLowerMap, [
      "Conferido_At",
      "conferido_at",
      "Checked_At",
      "checked_at",
      "conferido_em",
    ]),
    conferidoPorCol: pickColumn(columnsLowerMap, [
      "Conferido_Por",
      "conferido_por",
      "Checked_By",
      "checked_by",
    ]),
  };
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function mapRequiredDocKey(tipoNome) {
  const v = normalizeText(tipoNome);
  if (v.includes("identificacao") || v.includes("identidade")) {
    return "identificacao";
  }
  if (v.includes("comprovante") && v.includes("endere")) {
    return "comprovante";
  }
  if (v.includes("outro")) return "outros";
  return "outros";
}

function buildSupportDocumentFileName(safeUsuario, key, sequence = 1) {
  if (key === "identificacao") {
    return `${safeUsuario}_doc_Identificacao.pdf`;
  }
  if (key === "comprovante") {
    return `${safeUsuario}_doc_comprovante_Endereco.pdf`;
  }
  return `${safeUsuario}_doc_outros_${sequence}.pdf`;
}

async function checkAllRequiredDocsConcluded(req, userId, contratoId) {
  const tipos = await getDocumentoTipos(req);
  const docsMeta = await getDocumentosTableMeta(req);
  if (
    !docsMeta.exists ||
    !docsMeta.idCol ||
    !docsMeta.usuarioIdCol ||
    !docsMeta.contratoIdCol ||
    !docsMeta.tipoIdCol ||
    !docsMeta.filePathCol
  ) {
    return false;
  }

  const requiredTipos = tipos.filter(
    (t) => mapRequiredDocKey(t.Documento_Tipo) !== "outros",
  );

  for (const tipo of requiredTipos) {
    const [docRows] = await dbFor(req).query(
      `
        SELECT ${qcol(docsMeta.idCol)} AS id,
               ${qcol(docsMeta.filePathCol)} AS filePath
        FROM ${qtable(docsMeta.tableName)}
        WHERE ${qcol(docsMeta.usuarioIdCol)} = ?
          AND ${qcol(docsMeta.contratoIdCol)} = ?
          AND ${qcol(docsMeta.tipoIdCol)} = ?
        ORDER BY ${qcol(docsMeta.idCol)} DESC
      `,
      [userId, contratoId, tipo.Id],
    );

    if (!docRows || !docRows.length) {
      return false;
    }

    let hasAnyValidFile = false;
    for (const row of docRows) {
      if (!row?.filePath) continue;
      if (await fileExistsByStoredPath(row.filePath)) {
        hasAnyValidFile = true;
        break;
      }
    }

    if (!hasAnyValidFile) {
      return false;
    }
  }

  return true;
}

function isContratoConferido(row, meta) {
  const hasConferidoColumns = Boolean(meta.conferidoCol || meta.conferidoAtCol);

  if (hasConferidoColumns) {
    const byFlag = meta.conferidoCol
      ? isTruthyFlag(row[meta.conferidoCol])
      : false;
    const byDate = meta.conferidoAtCol
      ? isValidDbDate(row[meta.conferidoAtCol])
      : false;
    return Boolean(byFlag || byDate);
  }

  let conferido = false;
  if (meta.statusCol) {
    const statusValue = String(row[meta.statusCol] || "")
      .trim()
      .toLowerCase();
    if (
      [
        "conferido",
        "conferida",
        "aprovado",
        "aprovada",
        "vali" + "dado",
        "vali" + "dada",
        "ok",
      ].includes(statusValue)
    ) {
      conferido = true;
    }
  }
  return conferido;
}

async function checkAllDocsConferidosByContratoId(req, contratoId) {
  const docsMeta = await getDocumentosTableMeta(req);
  if (
    !docsMeta.exists ||
    !docsMeta.contratoIdCol ||
    !docsMeta.idCol ||
    !docsMeta.conferidoCol ||
    !docsMeta.conferidoAtCol
  ) {
    return { ok: false, total: 0, pendentes: 0, reason: "metadata_missing" };
  }

  const [docRows] = await dbFor(req).query(
    `
      SELECT
        ${qcol(docsMeta.idCol)} AS id,
        ${qcol(docsMeta.conferidoCol)} AS conferidoFlag,
        ${qcol(docsMeta.conferidoAtCol)} AS conferidoAt
      FROM ${qtable(docsMeta.tableName)}
      WHERE ${qcol(docsMeta.contratoIdCol)} = ?
    `,
    [contratoId],
  );

  const total = (docRows || []).length;
  if (total === 0) {
    return { ok: false, total: 0, pendentes: 0, reason: "no_documents" };
  }

  let pendentes = 0;
  for (const row of docRows) {
    const conferido =
      isTruthyFlag(row?.conferidoFlag) || isValidDbDate(row?.conferidoAt);
    if (!conferido) pendentes += 1;
  }

  return { ok: pendentes === 0, total, pendentes, reason: null };
}

router.get("/contratos/status", async (req, res) => {
  try {
    const login = getReqLogin(req);
    if (!login) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Usuário não identificado" });
    }

    const meta = await getContratosTableMeta(req);
    if (!meta.exists) {
      return res.json({
        status: "sucesso",
        contrato: null,
        possuiContratoDb: false,
        arquivoExiste: false,
        conferido: false,
        contratoValido: false,
      });
    }

    const row = await getLatestContratoRow(req, meta, login);
    if (!row) {
      return res.json({
        status: "sucesso",
        contrato: null,
        possuiContratoDb: false,
        arquivoExiste: false,
        conferido: false,
        contratoValido: false,
      });
    }

    const nomeArquivo = meta.nomeArquivoCol ? row[meta.nomeArquivoCol] : null;
    const filePath = meta.filePathCol ? row[meta.filePathCol] : null;
    const arquivoExiste = await fileExistsOnDisk(filePath, nomeArquivo);

    const conferido = isContratoConferido(row, meta);

    const contratoValido = Boolean(arquivoExiste && conferido);

    return res.json({
      status: "sucesso",
      contrato: {
        nomeArquivo: nomeArquivo || null,
        filePath: filePath || null,
      },
      possuiContratoDb: true,
      arquivoExiste,
      conferido,
      contratoValido,
    });
  } catch (error) {
    console.error("Error in GET /melpethostel/contratos/status:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post("/acesso", async (req, res) => {
  try {
    const login = getReqLogin(req);
    if (!login) {
      return res.status(401).json({
        status: "erro",
        mensagem: "Usuario nao autenticado",
      });
    }

    const result = await notifyModuleAccess(req);
    res.json({ status: "sucesso", ...result });
  } catch (error) {
    console.warn("Error in POST /melpethostel/acesso:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.get("/pets", async (req, res) => {
  try {
    const clienteId = await getCurrentClienteId(req);
    if (!clienteId) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Usuário sem cliente vinculado para listar pets.",
      });
    }

    const petsTable = await resolveTableName(req, TABLE_NAMES.pets);
    const fichasTable = await resolveTableName(req, TABLE_NAMES.petFichas);
    if (!petsTable || !fichasTable) {
      return res.json({ status: "ok", pets: [] });
    }

    const [rows] = await dbFor(req).query(
      `
        SELECT
          p.id,
          p.nome,
          p.raca,
          p.idade,
          p.peso_aproximado,
          p.criado_em,
          f.alimentacao_tipos
        FROM ${qtable(petsTable)} p
        LEFT JOIN ${qtable(fichasTable)} f ON f.pet_id = p.id
        WHERE p.cliente_id = ? AND p.ativo = 1
        ORDER BY p.criado_em DESC, p.id DESC
      `,
      [clienteId],
    );

    return res.json({
      status: "ok",
      pets: (rows || []).map((pet) => ({
        id: pet.id,
        nome: pet.nome,
        raca: pet.raca,
        idade: pet.idade,
        pesoAproximado: pet.peso_aproximado,
        cadastradoEm: pet.criado_em,
        alimentacaoTipos: parseJsonArray(pet.alimentacao_tipos),
      })),
    });
  } catch (error) {
    console.error("Error in GET /melpethostel/pets:", error);
    return res.status(500).json({
      status: "erro",
      mensagem: error?.message || "Não foi possível listar os pets.",
    });
  }
});

router.post("/pets", async (req, res) => {
  const conn = await dbFor(req).getConnection();

  try {
    const clienteId = await getCurrentClienteId(req);
    if (!clienteId) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Usuário sem cliente vinculado para cadastrar pet.",
      });
    }

    const petsTable = await resolveTableName(req, TABLE_NAMES.pets);
    const fichasTable = await resolveTableName(req, TABLE_NAMES.petFichas);
    if (!petsTable || !fichasTable) {
      return res.status(400).json({
        status: "erro",
        mensagem:
          "Tabelas Pets e Pet_Fichas não encontradas. Execute create_pets_schema.sql.",
      });
    }

    const data = req.body || {};

    await conn.beginTransaction();

    const [petResult] = await conn.query(
      `
        INSERT INTO ${qtable(petsTable)}
          (cliente_id, nome, raca, idade, peso_aproximado)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        clienteId,
        toText(data.nomePet),
        toText(data.raca),
        toText(data.idade),
        toText(data.pesoAproximado),
      ],
    );

    const petId = petResult.insertId;

    await conn.query(
      `
        INSERT INTO ${qtable(fichasTable)} (
          pet_id,
          veterinario_nome,
          clinica_nome,
          clinica_telefone,
          clinica_endereco,
          autoriza_atendimento_emergencial,
          autoriza_medicacao,
          sexo,
          castrado,
          doenca_diagnosticada,
          doenca_detalhes,
          cirurgias_historico,
          cirurgias_detalhes,
          medicamento_continuo,
          medicamento_detalhes,
          alimentacao_tipos,
          alimentacao_marca,
          alimentacao_quantidade_horarios,
          restricoes_alimentares,
          deixa_mexer_potinho,
          petiscos,
          comportamento_caes,
          agressividade,
          agressividade_situacoes,
          destroi_objetos,
          ansiedade_separacao,
          medos_especificos,
          reacao_medo,
          como_acalmar,
          fica_sozinho,
          tempo_sozinho,
          local_dormir,
          ritual_dormir_comer,
          aceita_banho_escovacao,
          aceita_roupinha,
          permite_manuseio,
          gosta_colo,
          sensibilidade_fisica,
          sensibilidade_detalhes,
          brinca_piscina,
          brinca_mangueira,
          brinca_bolinha,
          brinca_madeira,
          observacoes_tutor,
          veracidade_informacoes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        petId,
        toText(data.veterinarioNome),
        toText(data.clinicaNome),
        toText(data.clinicaTelefone),
        toText(data.clinicaEndereco),
        toText(data.autorizaAtendimentoEmergencial),
        toText(data.autorizaMedicacao),
        toText(data.sexo),
        toText(data.castrado),
        toText(data.doencaDiagnosticada),
        toText(data.doencaDetalhes),
        toText(data.cirurgiasHistorico),
        toText(data.cirurgiasDetalhes),
        toText(data.medicamentoContinuo),
        toText(data.medicamentoDetalhes),
        toJsonText(data.alimentacaoTipos),
        toText(data.alimentacaoMarca),
        toText(data.alimentacaoQuantidadeHorarios),
        toText(data.restricoesAlimentares),
        toText(data.deixaMexerPotinho),
        toText(data.petiscos),
        toText(data.comportamentoCaes),
        toText(data.agressividade),
        toText(data.agressividadeSituacoes),
        toText(data.destroiObjetos),
        toText(data.ansiedadeSeparacao),
        toText(data.medosEspecificos),
        toText(data.reacaoMedo),
        toText(data.comoAcalmar),
        toText(data.ficaSozinho),
        toText(data.tempoSozinho),
        toText(data.localDormir),
        toText(data.ritualDormirComer),
        toText(data.aceitaBanhoEscovacao),
        toText(data.aceitaRoupinha),
        toText(data.permiteManuseio),
        toText(data.gostaColo),
        toText(data.sensibilidadeFisica),
        toText(data.sensibilidadeDetalhes),
        toText(data.brincaPiscina),
        toText(data.brincaMangueira),
        toText(data.brincaBolinha),
        toText(data.brincaMadeira),
        toText(data.observacoesTutor),
        data.veracidadeInformacoes ? 1 : 0,
      ],
    );

    await conn.commit();

    return res.status(201).json({
      status: "ok",
      pet: {
        id: petId,
        nome: toText(data.nomePet),
        raca: toText(data.raca),
        idade: toText(data.idade),
        pesoAproximado: toText(data.pesoAproximado),
        cadastradoEm: new Date().toISOString(),
      },
    });
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // ignore rollback errors
    }

    console.error("Error in POST /melpethostel/pets:", error);
    return res.status(500).json({
      status: "erro",
      mensagem: error?.message || "Não foi possível cadastrar o pet.",
    });
  } finally {
    conn.release();
  }
});

router.get("/documentos/pendentes", async (req, res) => {
  try {
    const login = getReqLogin(req);
    if (!login) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Usuário não identificado" });
    }

    const meta = await getContratosTableMeta(req);
    if (!meta.exists || !meta.idCol) {
      return res.status(500).json({
        status: "erro",
        mensagem: `Tabela ${TABLE_NAMES.contratos} não está pronta para varredura.`,
      });
    }

    const users = await listUsuariosForDocuments(req);

    const pendentes = [];
    for (const user of users || []) {
      if (!user?.Usuario_ID || !user?.Usuario_Login) continue;

      const latestContrato = await getLatestContratoRow(
        req,
        meta,
        user.Usuario_Login,
      );
      if (!latestContrato || !latestContrato[meta.idCol]) continue;

      const nomeArquivo = meta.nomeArquivoCol
        ? latestContrato[meta.nomeArquivoCol]
        : null;
      const filePath = meta.filePathCol
        ? latestContrato[meta.filePathCol]
        : null;
      const arquivoExiste = await fileExistsOnDisk(filePath, nomeArquivo);
      if (!arquivoExiste) continue;

      const conferido = isContratoConferido(latestContrato, meta);
      if (conferido) continue;

      const requiredDocsComplete = await checkAllRequiredDocsConcluded(
        req,
        user.Usuario_ID,
        latestContrato[meta.idCol],
      );
      if (!requiredDocsComplete) continue;

      pendentes.push({
        usuarioId: user.Usuario_ID,
        nome: user.Usuario_Login,
      });
    }

    return res.json({
      status: "sucesso",
      total: pendentes.length,
      usuarios: pendentes,
    });
  } catch (error) {
    console.error("Error in GET /melpethostel/documentos/pendentes:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.get("/documentos/usuario/:usuarioId/arquivos", async (req, res) => {
  try {
    const login = getReqLogin(req);
    if (!login) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Usuário não identificado" });
    }

    const usuarioId = Number(req.params.usuarioId);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "usuarioId inválido" });
    }

    const user = await getUsuarioById(req, usuarioId);
    if (!user) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Usuário não encontrado" });
    }

    const meta = await getContratosTableMeta(req);
    if (!meta.exists || !meta.idCol) {
      return res.status(500).json({
        status: "erro",
        mensagem: `Tabela ${TABLE_NAMES.contratos} não está pronta.`,
      });
    }

    const latestContrato = await getLatestContratoRow(
      req,
      meta,
      user.Usuario_Login,
    );
    if (!latestContrato || !latestContrato[meta.idCol]) {
      return res.json({
        status: "sucesso",
        usuario: { id: user.Usuario_ID, nome: user.Usuario_Login },
        contratoId: null,
        arquivos: [],
      });
    }

    const contratoId = latestContrato[meta.idCol];
    const arquivos = [];

    const nomeArquivoContrato = meta.nomeArquivoCol
      ? latestContrato[meta.nomeArquivoCol]
      : null;
    const filePathContrato = meta.filePathCol
      ? latestContrato[meta.filePathCol]
      : null;

    if (nomeArquivoContrato && filePathContrato) {
      const existsDisk = await fileExistsOnDisk(
        filePathContrato,
        nomeArquivoContrato,
      );
      const storedPath = `${String(filePathContrato).replace(/\/+$/, "")}/${String(nomeArquivoContrato)}`;
      const contratoConferido = isContratoConferido(latestContrato, meta);
      arquivos.push({
        tipoRegistro: "contrato",
        contratoId,
        nomeDocumento: String(nomeArquivoContrato),
        tipoDocumento: "Contrato Assinado",
        filePath: storedPath,
        fileUrl: existsDisk ? toPublicUploadPath(storedPath) : null,
        existsDisk,
        conferido: contratoConferido,
        conferidoAt: meta.conferidoAtCol
          ? latestContrato[meta.conferidoAtCol] || null
          : null,
        conferidoPor: meta.conferidoPorCol
          ? latestContrato[meta.conferidoPorCol] || null
          : null,
      });
    }

    const docsMeta = await getDocumentosTableMeta(req);
    const tipoTableName =
      (await resolveTableName(req, TABLE_NAMES.documentosTipo)) ||
      TABLE_NAMES.documentosTipo;
    const docsSelectCols = [
      `d.${qcol(docsMeta.idCol || "Id")} AS docId`,
      `d.${qcol(docsMeta.filePathCol || "File_Path")} AS filePath`,
      "t.Documento_Tipo AS tipoDocumento",
    ];
    if (docsMeta.conferidoCol) {
      docsSelectCols.push(
        `d.${qcol(docsMeta.conferidoCol)} AS docConferidoFlag`,
      );
    }
    if (docsMeta.conferidoAtCol) {
      docsSelectCols.push(
        `d.${qcol(docsMeta.conferidoAtCol)} AS docConferidoAt`,
      );
    }
    if (docsMeta.conferidoPorCol) {
      docsSelectCols.push(
        `d.${qcol(docsMeta.conferidoPorCol)} AS docConferidoPor`,
      );
    }

    const [docRows] = await dbFor(req).query(
      `
        SELECT ${docsSelectCols.join(", ")}
        FROM ${qtable(docsMeta.tableName)} d
        LEFT JOIN ${qtable(tipoTableName)} t ON t.Id = d.${qcol(docsMeta.tipoIdCol || "Documento_Tipo_ID")}
        WHERE d.${qcol(docsMeta.usuarioIdCol || "Usuario_ID")} = ?
          AND d.${qcol(docsMeta.contratoIdCol || "Contrato_ID")} = ?
        ORDER BY d.${qcol(docsMeta.idCol || "Id")} ASC
      `,
      [user.Usuario_ID, contratoId],
    );

    for (const doc of docRows || []) {
      const storedPath = String(doc?.filePath || "").trim();
      if (!storedPath) continue;
      const existsDisk = await fileExistsByStoredPath(storedPath);
      const fileName = path.basename(storedPath);
      const conferido =
        isTruthyFlag(doc?.docConferidoFlag) ||
        isValidDbDate(doc?.docConferidoAt);
      arquivos.push({
        tipoRegistro: "documento",
        documentoId: doc?.docId || null,
        nomeDocumento: fileName || "Documento",
        tipoDocumento: doc?.tipoDocumento || "Documento",
        filePath: storedPath,
        fileUrl: existsDisk ? toPublicUploadPath(storedPath) : null,
        existsDisk,
        conferido,
        conferidoAt: doc?.docConferidoAt || null,
        conferidoPor: doc?.docConferidoPor || null,
      });
    }

    return res.json({
      status: "sucesso",
      usuario: { id: user.Usuario_ID, nome: user.Usuario_Login },
      contratoId,
      arquivos,
    });
  } catch (error) {
    console.error(
      "Error in GET /melpethostel/documentos/usuario/:usuarioId/arquivos:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post("/contratos/:contratoId/conferir", async (req, res) => {
  try {
    const login = getReqLogin(req);
    if (!login) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Usuário não identificado" });
    }

    const contratoId = Number(req.params.contratoId);
    if (!Number.isInteger(contratoId) || contratoId <= 0) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "contratoId inválido" });
    }

    const meta = await getContratosTableMeta(req);
    if (!meta.exists || !meta.idCol) {
      return res.status(500).json({
        status: "erro",
        mensagem: `Tabela ${TABLE_NAMES.contratos} não está pronta.`,
      });
    }

    if (!meta.conferidoCol || !meta.conferidoAtCol || !meta.conferidoPorCol) {
      return res.status(500).json({
        status: "erro",
        mensagem: `Colunas de conferência ausentes em ${TABLE_NAMES.contratos}.`,
      });
    }

    const [existingRows] = await dbFor(req).query(
      `
        SELECT ${qcol(meta.idCol)} AS id
        FROM ${qtable(meta.tableName)}
        WHERE ${qcol(meta.idCol)} = ?
        LIMIT 1
      `,
      [contratoId],
    );

    if (!existingRows || !existingRows.length) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Contrato não encontrado" });
    }

    const docsCheck = await checkAllDocsConferidosByContratoId(req, contratoId);
    if (!docsCheck.ok) {
      const mensagem =
        docsCheck.reason === "metadata_missing"
          ? `Tabela ${TABLE_NAMES.documentos} sem colunas de conferência para validar os documentos.`
          : docsCheck.reason === "no_documents"
            ? "Não há documentos vinculados para conferir este contrato."
            : `Ainda existem ${docsCheck.pendentes} documento(s) sem conferência.`;
      return res.status(409).json({ status: "erro", mensagem });
    }

    await dbFor(req).query(
      `
        UPDATE ${qtable(meta.tableName)}
        SET ${qcol(meta.conferidoCol)} = 1,
            ${qcol(meta.conferidoAtCol)} = NOW(),
            ${qcol(meta.conferidoPorCol)} = ?
        WHERE ${qcol(meta.idCol)} = ?
      `,
      [login, contratoId],
    );

    return res.json({
      status: "sucesso",
      mensagem: "Contrato conferido com sucesso.",
      contrato: {
        id: contratoId,
        conferido: true,
        conferidoPor: login,
      },
    });
  } catch (error) {
    console.error(
      "Error in POST /melpethostel/contratos/:contratoId/conferir:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post("/documentos/:documentoId/conferir", async (req, res) => {
  try {
    const login = getReqLogin(req);
    if (!login) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Usuário não identificado" });
    }

    const documentoId = Number(req.params.documentoId);
    if (!Number.isInteger(documentoId) || documentoId <= 0) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "documentoId inválido" });
    }

    const docsMeta = await getDocumentosTableMeta(req);
    if (!docsMeta.exists || !docsMeta.idCol) {
      return res.status(500).json({
        status: "erro",
        mensagem: `Tabela ${TABLE_NAMES.documentos} não está pronta.`,
      });
    }

    if (
      !docsMeta.conferidoCol ||
      !docsMeta.conferidoAtCol ||
      !docsMeta.conferidoPorCol
    ) {
      return res.status(500).json({
        status: "erro",
        mensagem:
          `Colunas de conferência ausentes em ${TABLE_NAMES.documentos}. Execute o script add_conferido_columns_to_melpethostel_documentos.sql.`,
      });
    }

    const [existingRows] = await dbFor(req).query(
      `
        SELECT ${qcol(docsMeta.idCol)} AS id
        FROM ${qtable(docsMeta.tableName)}
        WHERE ${qcol(docsMeta.idCol)} = ?
        LIMIT 1
      `,
      [documentoId],
    );

    if (!existingRows || !existingRows.length) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Documento não encontrado" });
    }

    await dbFor(req).query(
      `
        UPDATE ${qtable(docsMeta.tableName)}
        SET ${qcol(docsMeta.conferidoCol)} = 1,
            ${qcol(docsMeta.conferidoAtCol)} = NOW(),
            ${qcol(docsMeta.conferidoPorCol)} = ?
        WHERE ${qcol(docsMeta.idCol)} = ?
      `,
      [login, documentoId],
    );

    return res.json({
      status: "sucesso",
      mensagem: "Documento conferido com sucesso.",
      documento: {
        id: documentoId,
        conferido: true,
        conferidoPor: login,
      },
    });
  } catch (error) {
    console.error(
      "Error in POST /melpethostel/documentos/:documentoId/conferir:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post(
  "/contratos/upload",
  uploadContrato.single("arquivo"),
  async (req, res) => {
    try {
      const login = getReqLogin(req);
      if (!login) {
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Usuário não identificado" });
      }

      if (!req.file || !req.file.buffer) {
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Arquivo é obrigatório" });
      }

      const originalName = String(req.file.originalname || "").toLowerCase();
      const mime = String(req.file.mimetype || "").toLowerCase();
      const isPdf = originalName.endsWith(".pdf") || mime === "application/pdf";
      if (!isPdf) {
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Envie um arquivo PDF" });
      }

      if (!(await requireCompleteClienteCadastro(req, res, login))) return;

      const meta = await getContratosTableMeta(req);
      const missingUploadColumns = [
        !meta.exists ? "tabela" : null,
        !meta.loginCol ? "Usuario_Login/usuario_login" : null,
        !meta.nomeArquivoCol ? "Nome_Arquivo/nome_arquivo" : null,
        !meta.filePathCol ? "File_Path/file_path" : null,
      ].filter(Boolean);
      if (
        !meta.exists ||
        !meta.loginCol ||
        !meta.nomeArquivoCol ||
        !meta.filePathCol
      ) {
        return res.status(500).json({
          status: "erro",
          mensagem:
            `Tabela ${meta.tableName || TABLE_NAMES.contratos} nao esta pronta para upload. Faltando: ${missingUploadColumns.join(", ")}.`,
        });
      }

      const existingRow = await getLatestContratoRow(req, meta, login);
      const userDirData = await resolveUserDocumentsRelativeDir(req, login);
      if (!userDirData) {
        return res.status(400).json({
          status: "erro",
          mensagem: "Usuário sem grupo configurado para salvar contrato.",
        });
      }

      const { relativeDir, safeUsuario } = userDirData;
      const diskDir = resolveUploadsDirToDisk(relativeDir);
      await fs.mkdir(diskDir, { recursive: true });

      const finalFileName = `${safeUsuario}_Contrato_Assinado.pdf`;
      const fullPath = path.join(diskDir, finalFileName);
      await fs.writeFile(fullPath, req.file.buffer);

      if (existingRow && meta.idCol) {
        const setParts = [
          `${qcol(meta.nomeArquivoCol)} = ?`,
          `${qcol(meta.filePathCol)} = ?`,
        ];
        const params = [finalFileName, relativeDir];

        if (meta.conferidoCol) {
          setParts.push(`${qcol(meta.conferidoCol)} = ?`);
          params.push(0);
        }
        if (meta.conferidoAtCol) {
          setParts.push(`${qcol(meta.conferidoAtCol)} = NULL`);
        }
        if (meta.statusCol) {
          setParts.push(`${qcol(meta.statusCol)} = ?`);
          params.push("pendente");
        }
        params.push(existingRow[meta.idCol]);

        await dbFor(req).query(
          `UPDATE ${qtable(meta.tableName)} SET ${setParts.join(", ")} WHERE ${qcol(meta.idCol)} = ?`,
          params,
        );
      } else {
        const insertCols = [
          meta.loginCol,
          meta.nomeArquivoCol,
          meta.filePathCol,
        ];
        const insertVals = [login, finalFileName, relativeDir];

        if (meta.conferidoCol) {
          insertCols.push(meta.conferidoCol);
          insertVals.push(0);
        }
        if (meta.statusCol) {
          insertCols.push(meta.statusCol);
          insertVals.push("pendente");
        }
        await dbFor(req).query(
          `INSERT INTO ${qtable(meta.tableName)} (${insertCols.map(qcol).join(", ")}) VALUES (${insertCols
            .map(() => "?")
            .join(", ")})`,
          insertVals,
        );
      }

      return res.json({
        status: "sucesso",
        mensagem: "Contrato enviado com sucesso",
        arquivo: {
          nomeArquivo: finalFileName,
          filePath: relativeDir,
        },
      });
    } catch (error) {
      console.error("Error in POST /melpethostel/contratos/upload:", error);
      res.status(500).json({ status: "erro", mensagem: error.message });
    }
  },
);

router.get("/documentos/tipos", async (req, res) => {
  try {
    const tipos = await getDocumentoTipos(req);
    return res.json({ status: "sucesso", tipos });
  } catch (error) {
    console.error("Error in GET /melpethostel/documentos/tipos:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.get("/documentos/status", async (req, res) => {
  try {
    const login = getReqLogin(req);
    if (!login) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Usuário não identificado" });
    }

    const userRow = await getUsuarioByLogin(req, login);
    if (!userRow || !userRow.Usuario_ID) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Usuário não encontrado" });
    }

    const meta = await getContratosTableMeta(req);
    if (!meta.exists || !meta.idCol) {
      return res.status(500).json({
        status: "erro",
        mensagem:
          `Tabela ${TABLE_NAMES.contratos} não está pronta para verificação.`,
      });
    }

    const latestContrato = await getLatestContratoRow(req, meta, login);
    if (!latestContrato || !latestContrato[meta.idCol]) {
      return res.json({ status: "sucesso", documentos: [] });
    }

    const contratoId = latestContrato[meta.idCol];
    const tipos = await getDocumentoTipos(req);
    const docsMeta = await getDocumentosTableMeta(req);
    if (
      !docsMeta.exists ||
      !docsMeta.usuarioIdCol ||
      !docsMeta.contratoIdCol ||
      !docsMeta.tipoIdCol ||
      !docsMeta.filePathCol
    ) {
      return res.status(500).json({
        status: "erro",
        mensagem: `Tabela ${TABLE_NAMES.documentos} nao esta pronta para verificacao.`,
      });
    }

    const [docRows] = await dbFor(req).query(
      `
        SELECT ${qcol(docsMeta.tipoIdCol)} AS tipoId,
               ${qcol(docsMeta.filePathCol)} AS filePath
        FROM ${qtable(docsMeta.tableName)}
        WHERE ${qcol(docsMeta.usuarioIdCol)} = ?
          AND ${qcol(docsMeta.contratoIdCol)} = ?
      `,
      [userRow.Usuario_ID, contratoId],
    );

    const docsByTipoId = new Map();
    for (const d of docRows || []) {
      const tipoId = Number(d.tipoId);
      const existing = docsByTipoId.get(tipoId) || [];
      existing.push(d);
      docsByTipoId.set(tipoId, existing);
    }

    const documentos = [];
    for (const tipo of tipos) {
      const docsForTipo = docsByTipoId.get(Number(tipo.Id)) || [];
      const doc = docsForTipo.length
        ? docsForTipo[docsForTipo.length - 1]
        : null;

      let identifiedCount = 0;
      for (const candidate of docsForTipo) {
        if (!candidate?.filePath) continue;
        if (await fileExistsByStoredPath(candidate.filePath)) {
          identifiedCount += 1;
        }
      }

      const existsDb = docsForTipo.some((candidate) =>
        Boolean(candidate?.filePath),
      );
      const existsDisk = identifiedCount > 0;

      const requiredKey = mapRequiredDocKey(tipo.Documento_Tipo);
      documentos.push({
        tipoId: tipo.Id,
        tipoNome: tipo.Documento_Tipo,
        key: requiredKey,
        required: requiredKey !== "outros",
        existsDb,
        existsDisk,
        identifiedCount,
        status: existsDb && existsDisk ? "concluido" : "pendente",
        filePath: doc && doc.filePath ? doc.filePath : null,
      });
    }

    return res.json({ status: "sucesso", documentos });
  } catch (error) {
    console.error("Error in GET /melpethostel/documentos/status:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post(
  "/documentos/upload",
  uploadContrato.single("arquivo"),
  async (req, res) => {
    try {
      const login = getReqLogin(req);
      if (!login) {
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Usuário não identificado" });
      }

      if (!req.file || !req.file.buffer) {
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Arquivo é obrigatório" });
      }

      const tipoId = Number(req.body && req.body.tipoId);
      if (!Number.isInteger(tipoId) || tipoId <= 0) {
        return res.status(400).json({
          status: "erro",
          mensagem: "tipoId é obrigatório para upload do documento.",
        });
      }

      const originalName = String(req.file.originalname || "").toLowerCase();
      const mime = String(req.file.mimetype || "").toLowerCase();
      const isPdf = originalName.endsWith(".pdf") || mime === "application/pdf";
      if (!isPdf) {
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Envie um arquivo PDF" });
      }

      if (!(await requireCompleteClienteCadastro(req, res, login))) return;

      const tipo = await getDocumentoTipoById(req, tipoId);
      if (!tipo) {
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Tipo de documento inválido." });
      }

      const userRow = await getUsuarioByLogin(req, login);
      if (!userRow || !userRow.Usuario_ID) {
        return res.status(400).json({
          status: "erro",
          mensagem: "Usuário não encontrado para vincular o documento.",
        });
      }

      const meta = await getContratosTableMeta(req);
      if (!meta.exists || !meta.idCol) {
        return res.status(500).json({
          status: "erro",
          mensagem:
            `Tabela ${TABLE_NAMES.contratos} não está pronta para vincular documento (ID ausente).`,
        });
      }

      const latestContrato = await getLatestContratoRow(req, meta, login);
      if (!latestContrato) {
        return res.status(400).json({
          status: "erro",
          mensagem: "Nenhum contrato encontrado para vincular o documento.",
        });
      }

      const contratoId = latestContrato[meta.idCol];
      if (!contratoId) {
        return res.status(400).json({
          status: "erro",
          mensagem: "Contrato inválido para vincular o documento.",
        });
      }

      const userDirData = await resolveUserDocumentsRelativeDir(req, login);
      if (!userDirData) {
        return res.status(400).json({
          status: "erro",
          mensagem: "Usuário sem grupo configurado para salvar documento.",
        });
      }

      const { relativeDir, safeUsuario } = userDirData;
      const docKey = mapRequiredDocKey(tipo.Documento_Tipo);
      const diskDir = resolveUploadsDirToDisk(relativeDir);
      await fs.mkdir(diskDir, { recursive: true });

      const docsMeta = await getDocumentosTableMeta(req);
      if (
        !docsMeta.exists ||
        !docsMeta.idCol ||
        !docsMeta.usuarioIdCol ||
        !docsMeta.contratoIdCol ||
        !docsMeta.tipoIdCol ||
        !docsMeta.filePathCol
      ) {
        return res.status(500).json({
          status: "erro",
          mensagem: `Tabela ${TABLE_NAMES.documentos} nao esta pronta para upload (colunas obrigatorias ausentes).`,
        });
      }

      const [existingRows] = await dbFor(req).query(
        `
          SELECT ${qcol(docsMeta.idCol)} AS id,
                 ${qcol(docsMeta.filePathCol)} AS filePath
          FROM ${qtable(docsMeta.tableName)}
          WHERE ${qcol(docsMeta.usuarioIdCol)} = ?
            AND ${qcol(docsMeta.contratoIdCol)} = ?
            AND ${qcol(docsMeta.tipoIdCol)} = ?
          ORDER BY ${qcol(docsMeta.idCol)}
        `,
        [userRow.Usuario_ID, contratoId, tipo.Id],
      );

      let finalFileName = buildSupportDocumentFileName(safeUsuario, docKey);
      if (docKey === "outros") {
        let sequence = (existingRows || []).length + 1;
        while (true) {
          const candidateName = buildSupportDocumentFileName(
            safeUsuario,
            docKey,
            sequence,
          );
          const candidatePath = path.join(diskDir, candidateName);
          try {
            await fs.access(candidatePath);
            sequence += 1;
          } catch {
            finalFileName = candidateName;
            break;
          }
        }
      }

      const fullPath = path.join(diskDir, finalFileName);
      await fs.writeFile(fullPath, req.file.buffer);

      const filePath = `${relativeDir}/${finalFileName}`.replace(/\\/g, "/");

      if (docKey === "outros") {
        await dbFor(req).query(
          `
            INSERT INTO ${qtable(docsMeta.tableName)}
              (${[
                docsMeta.usuarioIdCol,
                docsMeta.contratoIdCol,
                docsMeta.tipoIdCol,
                docsMeta.filePathCol,
              ]
                .map(qcol)
                .join(", ")})
            VALUES (?, ?, ?, ?)
          `,
          [userRow.Usuario_ID, contratoId, tipo.Id, filePath],
        );
      } else if (existingRows && existingRows.length) {
        await dbFor(req).query(
          `
            UPDATE ${qtable(docsMeta.tableName)}
            SET ${qcol(docsMeta.filePathCol)} = ?
            WHERE ${qcol(docsMeta.idCol)} = ?
          `,
          [filePath, existingRows[0].id],
        );
      } else {
        await dbFor(req).query(
          `
            INSERT INTO ${qtable(docsMeta.tableName)}
              (${[
                docsMeta.usuarioIdCol,
                docsMeta.contratoIdCol,
                docsMeta.tipoIdCol,
                docsMeta.filePathCol,
              ]
                .map(qcol)
                .join(", ")})
            VALUES (?, ?, ?, ?)
          `,
          [userRow.Usuario_ID, contratoId, tipo.Id, filePath],
        );
      }

      return res.json({
        status: "sucesso",
        mensagem: "Documento enviado com sucesso",
        documento: {
          tipoId: tipo.Id,
          tipoNome: tipo.Documento_Tipo,
          filePath,
        },
      });
    } catch (error) {
      if (
        error?.code === "ER_DUP_ENTRY" &&
        String(error?.message || "").includes(
          "uq_mph_doc_usuario_contrato_tipo",
        )
      ) {
        return res.status(409).json({
          status: "erro",
          mensagem:
            `A base ainda está com chave única em ${TABLE_NAMES.documentos}. Execute o script API/scripts/drop_unique_mph_documentos.sql para permitir múltiplos 'Outros Documentos'.`,
        });
      }

      console.error("Error in POST /melpethostel/documentos/upload:", error);
      res.status(500).json({ status: "erro", mensagem: error.message });
    }
  },
);

// List groups
router.get("/groups", async (req, res) => {
  try {
    const grupos = await Grupo.list(req);
    return res.json(grupos);
  } catch (error) {
    console.error("Error in /melpethostel/groups:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

// Create group
router.post("/groups", async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome || !nome.trim())
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Nome é obrigatório" });

    await Grupo.create(req, nome.trim());

    // create upload folders for the group if not present
    try {
      const uploadsRoot =
        process.env.UPLOADS_ROOT || path.resolve(__dirname, "../../../uploads");
      const safeName = String(nome)
        .trim()
        .replace(/[\\/\\\\:?"<>|*]/g, "-");
      const groupDir = path.join(uploadsRoot, safeName);
      await fs.mkdir(groupDir, { recursive: true });
    } catch (err) {
      console.warn(
        "Warning: failed to create upload dirs for melpethostel group:",
        err?.message || err,
      );
    }

    return res.json({ status: "sucesso", mensagem: "Grupo criado" });
  } catch (error) {
    console.error("Error in POST /melpethostel/groups:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

// List users
router.get("/users", async (req, res) => {
  try {
    const usuarios = await Usuario.list(req);
    return res.json(
      usuarios.map((usuario) => ({
        id: usuario.id,
        login: usuario.login,
        grupo: usuario.grupo,
        Created_At: usuario.created_at,
        Updated_At: usuario.updated_at,
      })),
    );
  } catch (error) {
    console.error("Error in /melpethostel/users:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

// Create user
router.post("/users", async (req, res) => {
  try {
    const { login, grupo, senhaProvisoria } = req.body;
    if (!login || !senhaProvisoria)
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Login e senha são obrigatórios" });

    const senhaHash = await bcrypt.hash(String(senhaProvisoria), 10);
    const grupoId = Number(grupo);

    if (!Number.isInteger(grupoId) || grupoId <= 0) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Grupo invalido" });
    }

    const group = await Grupo.findById(req, grupoId);
    if (!group) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Grupo invalido" });
    }

    await Usuario.create(req, {
      login: login.trim(),
      senhaHash,
      grupoId,
      primeiroAcesso: 1,
      ativo: 1,
    });
    return res.json({ status: "sucesso", mensagem: "Usuário criado" });
  } catch (error) {
    console.error("Error in POST /melpethostel/users:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

module.exports = router;
