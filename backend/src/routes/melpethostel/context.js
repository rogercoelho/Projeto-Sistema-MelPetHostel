const db = require("../../config/database");
const path = require("path");
const fs = require("fs").promises;
const multer = require("multer");
const { Endereco, Grupo, Usuario } = require("../../models");
const { getClienteCadastroStatus } = require("../../utils/clientProfile");

const uploadsRootDefault =
  process.env.UPLOADS_ROOT || path.resolve(__dirname, "../../../uploads");
const uploadContrato = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const TABLE_NAMES = Object.freeze({
  clientes: "Clientes",
  contratos: "Contratos",
  documentos: "Documentos",
  documentosTipo: "Documentos_Tipo",
  pets: "Pets",
  petFichas: "Pet_Fichas",
  petCarteirasVacinacao: "Pet_Carteiras_Vacinacao",
  petVacinasConfig: "Pet_Vacinas_Config",
  petVacinasRespostas: "Pet_Vacinas_Respostas",
  planos: "Planos",
  hospedagemSolicitacoes: "Hospedagem_Solicitacoes",
  hospedagemSolicitacaoItens: "Hospedagem_Solicitacao_Itens",
});

const DEFAULT_DOCUMENT_TYPES = Object.freeze([
  { id: 1, nome: "Documento de Identificacao" },
  { id: 2, nome: "Comprovante de Endereco" },
  { id: 3, nome: "Outros Documentos" },
]);

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

function sanitizeStoredPathPart(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/\\\\:?"<>|*]/g, "-");
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
  const parts = cleaned
    .split("/")
    .filter((part) => part && part !== "." && part !== "..");
  if (!parts.length) return null;
  return `/melpethostel/uploads/${parts.map(encodeURIComponent).join("/")}`;
}

function resolveUploadsDirToDisk(relativeDir) {
  const cleaned = String(relativeDir || "")
    .replace(/^\/?(?:melpethostel\/)?uploads\/?/i, "")
    .replace(/\\/g, "/");
  const parts = cleaned.split("/").filter(Boolean).map(sanitizePart);
  const root = path.resolve(uploadsRootDefault);
  const abs = path.resolve(path.join(uploadsRootDefault, ...parts));
  if (!abs.startsWith(root)) {
    throw new Error("Caminho de upload invÃ¡lido");
  }
  return abs;
}

function resolveUploadsFileToDisk(rawPath) {
  const cleaned = String(rawPath || "")
    .replace(/^\/?(?:melpethostel\/)?uploads\/?/i, "")
    .replace(/\\/g, "/");
  const parts = cleaned.split("/").filter(Boolean).map(sanitizeStoredPathPart);
  const root = path.resolve(uploadsRootDefault);
  const abs = path.resolve(path.join(uploadsRootDefault, ...parts));
  if (!abs.startsWith(root)) {
    throw new Error("Caminho de upload invÃ¡lido");
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

function resolveUserExpurgoRelativeDir(relativeDir) {
  const normalized = normalizeUploadsDir(relativeDir);
  if (!normalized) return null;

  return normalized.replace(/\/Documentos\/?$/i, "/expurgo");
}

async function ensureUserDocumentStorage(req, login) {
  const userDirData = await resolveUserDocumentsRelativeDir(req, login);
  if (!userDirData) return null;

  const documentosDir = resolveUploadsDirToDisk(userDirData.relativeDir);
  await fs.mkdir(documentosDir, { recursive: true });

  const expurgoRelativeDir = resolveUserExpurgoRelativeDir(
    userDirData.relativeDir,
  );
  if (expurgoRelativeDir) {
    const expurgoDir = resolveUploadsDirToDisk(expurgoRelativeDir);
    await fs.mkdir(expurgoDir, { recursive: true });
  }

  return {
    ...userDirData,
    expurgoRelativeDir,
  };
}

async function moveUploadFileToRelativeDir(rawFilePath, targetRelativeDir) {
  const sourcePath = String(rawFilePath || "").trim();
  if (!sourcePath || !targetRelativeDir) return null;

  const sourceDiskPath = resolveUploadsFileToDisk(sourcePath);
  const fileName = path.basename(sourcePath);
  if (!fileName) return null;

  const targetDiskDir = resolveUploadsDirToDisk(targetRelativeDir);
  await fs.mkdir(targetDiskDir, { recursive: true });

  let targetName = fileName;
  let targetDiskPath = path.join(targetDiskDir, targetName);
  const parsed = path.parse(fileName);
  for (let index = 1; ; index += 1) {
    try {
      await fs.access(targetDiskPath);
      targetName = `${parsed.name}-${index}${parsed.ext}`;
      targetDiskPath = path.join(targetDiskDir, targetName);
    } catch {
      break;
    }
  }

  try {
    await fs.rename(sourceDiskPath, targetDiskPath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    await fs.copyFile(sourceDiskPath, targetDiskPath);
    await fs.unlink(sourceDiskPath);
  }

  return `${targetRelativeDir}/${targetName}`.replace(/\\/g, "/");
}

async function getUsuarioLoginByClienteId(req, clienteId) {
  if (!clienteId) return null;

  const usuarios = await Usuario.list(req);
  const usuario = (usuarios || []).find(
    (item) => Number(item?.Cliente_ID || item?.clienteId) === Number(clienteId),
  );
  return usuario?.Usuario_Login || usuario?.login || null;
}

async function movePetDocumentsToExpurgo(req, { petId, clienteId, login }) {
  if (!petId || !clienteId || !login) return 0;

  const carteirasTable = await resolveTableName(
    req,
    TABLE_NAMES.petCarteirasVacinacao,
  );
  if (!carteirasTable) return 0;

  const userDirData = await ensureUserDocumentStorage(req, login);
  if (!userDirData) return 0;

  const expurgoRelativeDir =
    userDirData.expurgoRelativeDir ||
    resolveUserExpurgoRelativeDir(userDirData.relativeDir);
  if (!expurgoRelativeDir) return 0;

  const [carteiras] = await dbFor(req).query(
    `SELECT id, file_path FROM ${qtable(carteirasTable)}
      WHERE pet_id = ? AND cliente_id = ?`,
    [petId, clienteId],
  );

  let movedDocuments = 0;
  for (const carteira of carteiras || []) {
    const currentFilePath = String(carteira.file_path || "").trim();
    const alreadyInExpurgo = /\/expurgo\//i.test(
      currentFilePath.replace(/\\/g, "/"),
    );
    const newFilePath = alreadyInExpurgo
      ? currentFilePath
      : await moveUploadFileToRelativeDir(currentFilePath, expurgoRelativeDir);

    await dbFor(req).query(
      `UPDATE ${qtable(carteirasTable)}
          SET file_path = ?,
              conferido = 0,
              conferido_at = NULL,
              conferido_por = NULL,
              status = 'expurgado'
        WHERE id = ?`,
      [newFilePath || currentFilePath, carteira.id],
    );
    if (newFilePath && !alreadyInExpurgo) movedDocuments += 1;
  }

  return movedDocuments;
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
    statusCol: pickColumn(columnsLowerMap, ["Status", "status"]),
    motivoReprovacaoCol: pickColumn(columnsLowerMap, [
      "motivo_reprovacao",
      "Motivo_Reprovacao",
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
               ${qcol(docsMeta.filePathCol)} AS filePath,
               ${docsMeta.statusCol ? qcol(docsMeta.statusCol) : "'pendente'"} AS status
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
      if (String(row.status || "").trim().toLowerCase() === "reprovado") {
        continue;
      }
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


module.exports = {
  DEFAULT_DOCUMENT_TYPES,
  Endereco,
  Grupo,
  TABLE_NAMES,
  Usuario,
  buildSupportDocumentFileName,
  checkAllDocsConferidosByContratoId,
  checkAllRequiredDocsConcluded,
  dbFor,
  fileExistsByStoredPath,
  fileExistsOnDisk,
  fs,
  ensureUserDocumentStorage,
  getClienteCadastroStatusByLogin,
  getContratosTableMeta,
  getCurrentClienteId,
  getDocumentoTipoById,
  getDocumentoTipos,
  getDocumentosTableMeta,
  getGroupNameById,
  getLatestContratoRow,
  getReqGrupo,
  getReqLogin,
  getUsuarioById,
  getUsuarioLoginByClienteId,
  getUsuarioByLogin,
  isAdminUser,
  isContratoConferido,
  isNewUsuariosSource,
  isNumericId,
  isTruthyFlag,
  isValidDbDate,
  listUsuariosForDocuments,
  mapRequiredDocKey,
  movePetDocumentsToExpurgo,
  moveUploadFileToRelativeDir,
  normalizeDocumentUser,
  normalizeDocumentoTipo,
  normalizeText,
  normalizeUploadsDir,
  parseJsonArray,
  path,
  qcol,
  qtable,
  requireCompleteClienteCadastro,
  resolveGroupNameForUser,
  resolveTableName,
  resolveUploadsDirToDisk,
  resolveUploadsFileToDisk,
  resolveUserExpurgoRelativeDir,
  resolveUserDocumentsRelativeDir,
  sanitizePart,
  toJsonText,
  toPublicUploadPath,
  toText,
  uploadContrato,
  uploadsRootDefault,
};
