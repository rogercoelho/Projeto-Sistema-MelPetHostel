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

const uploadsRootDefault =
  process.env.UPLOADS_ROOT || path.resolve(__dirname, "../../../uploads");
const uploadContrato = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.use("/telegram", require("./telegram"));

function dbFor(req) {
  return req && req.db ? req.db : db;
}

function qcol(name) {
  return `\`${String(name || "").replace(/`/g, "")}\``;
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
  const [rows] = await dbFor(req).query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MelPetHostel_Contratos'
    `,
  );

  const columnsLowerMap = new Map();
  for (const r of rows || []) {
    const n = String(r.COLUMN_NAME || "");
    if (n) columnsLowerMap.set(n.toLowerCase(), n);
  }

  return {
    exists: columnsLowerMap.size > 0,
    columnsLowerMap,
    idCol: pickColumn(columnsLowerMap, ["Contrato_ID", "ID", "Id"]),
    loginCol: pickColumn(columnsLowerMap, [
      "Usuario_Login",
      "Login",
      "Usuario",
      "User_Login",
    ]),
    nomeArquivoCol: pickColumn(columnsLowerMap, [
      "Nome_Arquivo",
      "NomeArquivo",
      "Nome_Documento",
      "File_Name",
    ]),
    filePathCol: pickColumn(columnsLowerMap, ["File_Path", "FilePath", "Path"]),
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
    updatedAtCol: pickColumn(columnsLowerMap, ["Updated_At", "UpdatedAt"]),
    adminNotifiedAtCol: pickColumn(columnsLowerMap, [
      "Admin_Notified_At",
      "admin_notified_at",
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
        meta.adminNotifiedAtCol,
      ].filter(Boolean),
    )
    .filter(Boolean);

  const uniqueCols = [...new Set(selectCols)];
  const orderCol = meta.updatedAtCol || meta.idCol || meta.loginCol;

  const sql = `
    SELECT ${uniqueCols.map(qcol).join(", ")}
    FROM MelPetHostel_Contratos
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

async function getUsuarioByLogin(req, login) {
  const [rows] = await dbFor(req).query(
    "SELECT Usuario_ID, Usuario_Login, Usuario_Grupo FROM MelPetHostel_Usuarios WHERE Usuario_Login = ? LIMIT 1",
    [login],
  );
  return rows && rows.length ? rows[0] : null;
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
    (req && req.user && req.user.Usuario_Grupo) ||
    (req && req.user && req.user.usuarioGrupo) ||
    null
  );
}

async function resolveGroupNameForUser(req, login) {
  const fromToken = getReqGrupo(req);
  if (fromToken && String(fromToken).trim()) {
    return sanitizePart(fromToken);
  }

  const userRow = await getUsuarioByLogin(req, login);
  const grupoRaw = userRow ? userRow.Usuario_Grupo : null;
  if (!grupoRaw) return null;

  // If user stores group id, resolve to group name.
  if (/^\d+$/.test(String(grupoRaw))) {
    const [groupRows] = await dbFor(req).query(
      "SELECT Grupo_Nome FROM MelPetHostel_Grupos WHERE Grupo_ID = ? LIMIT 1",
      [Number(grupoRaw)],
    );
    if (groupRows && groupRows.length && groupRows[0].Grupo_Nome) {
      return sanitizePart(groupRows[0].Grupo_Nome);
    }
  }

  return sanitizePart(grupoRaw);
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

  const userRow = await getUsuarioByLogin(req, login);
  if (userRow && isAdminGroupValue(userRow.Usuario_Grupo)) return true;

  const resolvedGroup = await resolveGroupNameForUser(req, login);
  return isAdminGroupValue(resolvedGroup);
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

async function getDocumentoTipos(req) {
  const [rows] = await dbFor(req).query(
    "SELECT Id, Documento_Tipo FROM MelPetHostel_Documentos_Tipos ORDER BY Id",
  );
  return rows || [];
}

async function getDocumentoTipoById(req, id) {
  const [rows] = await dbFor(req).query(
    "SELECT Id, Documento_Tipo FROM MelPetHostel_Documentos_Tipos WHERE Id = ? LIMIT 1",
    [id],
  );
  return rows && rows.length ? rows[0] : null;
}

async function getDocumentosTableMeta(req) {
  const [rows] = await dbFor(req).query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MelPetHostel_Documentos'
    `,
  );

  const columnsLowerMap = new Map();
  for (const r of rows || []) {
    const n = String(r.COLUMN_NAME || "");
    if (n) columnsLowerMap.set(n.toLowerCase(), n);
  }

  return {
    exists: columnsLowerMap.size > 0,
    columnsLowerMap,
    idCol: pickColumn(columnsLowerMap, ["Id", "ID"]),
    usuarioIdCol: pickColumn(columnsLowerMap, ["Usuario_ID", "UsuarioId"]),
    contratoIdCol: pickColumn(columnsLowerMap, ["Contrato_ID", "ContratoId"]),
    tipoIdCol: pickColumn(columnsLowerMap, [
      "Documento_Tipo_ID",
      "DocumentoTipoId",
    ]),
    filePathCol: pickColumn(columnsLowerMap, ["File_Path", "FilePath"]),
    conferidoCol: pickColumn(columnsLowerMap, ["Conferido", "Checked"]),
    conferidoAtCol: pickColumn(columnsLowerMap, ["Conferido_At", "Checked_At"]),
    conferidoPorCol: pickColumn(columnsLowerMap, [
      "Conferido_Por",
      "Checked_By",
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
  if (v === normalizeText("Documento de Identificacao")) return "identificacao";
  if (v === normalizeText("Comprovante de Endereço")) return "comprovante";
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
  const requiredTipos = tipos.filter(
    (t) => mapRequiredDocKey(t.Documento_Tipo) !== "outros",
  );

  for (const tipo of requiredTipos) {
    const [docRows] = await dbFor(req).query(
      `
        SELECT Id, File_Path
        FROM MelPetHostel_Documentos
        WHERE Usuario_ID = ? AND Contrato_ID = ? AND Documento_Tipo_ID = ?
        ORDER BY Id DESC
      `,
      [userId, contratoId, tipo.Id],
    );

    if (!docRows || !docRows.length) {
      return false;
    }

    let hasAnyValidFile = false;
    for (const row of docRows) {
      if (!row?.File_Path) continue;
      if (await fileExistsByStoredPath(row.File_Path)) {
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
      FROM MelPetHostel_Documentos
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
        mensagem:
          "Tabela MelPetHostel_Contratos não está pronta para varredura.",
      });
    }

    const [users] = await dbFor(req).query(
      `
        SELECT Usuario_ID, Usuario_Login
        FROM MelPetHostel_Usuarios
        ORDER BY Usuario_Login
      `,
    );

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

    const [userRows] = await dbFor(req).query(
      `
        SELECT Usuario_ID, Usuario_Login
        FROM MelPetHostel_Usuarios
        WHERE Usuario_ID = ?
        LIMIT 1
      `,
      [usuarioId],
    );

    const user = userRows && userRows.length ? userRows[0] : null;
    if (!user) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Usuário não encontrado" });
    }

    const meta = await getContratosTableMeta(req);
    if (!meta.exists || !meta.idCol) {
      return res.status(500).json({
        status: "erro",
        mensagem: "Tabela MelPetHostel_Contratos não está pronta.",
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
        FROM MelPetHostel_Documentos d
        LEFT JOIN MelPetHostel_Documentos_Tipos t ON t.Id = d.${qcol(docsMeta.tipoIdCol || "Documento_Tipo_ID")}
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
        mensagem: "Tabela MelPetHostel_Contratos não está pronta.",
      });
    }

    if (!meta.conferidoCol || !meta.conferidoAtCol || !meta.conferidoPorCol) {
      return res.status(500).json({
        status: "erro",
        mensagem: "Colunas de conferência ausentes em MelPetHostel_Contratos.",
      });
    }

    const [existingRows] = await dbFor(req).query(
      `
        SELECT ${qcol(meta.idCol)} AS id
        FROM MelPetHostel_Contratos
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
          ? "Tabela MelPetHostel_Documentos sem colunas de conferência para validar os documentos."
          : docsCheck.reason === "no_documents"
            ? "Não há documentos vinculados para conferir este contrato."
            : `Ainda existem ${docsCheck.pendentes} documento(s) sem conferência.`;
      return res.status(409).json({ status: "erro", mensagem });
    }

    await dbFor(req).query(
      `
        UPDATE MelPetHostel_Contratos
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
        mensagem: "Tabela MelPetHostel_Documentos não está pronta.",
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
          "Colunas de conferência ausentes em MelPetHostel_Documentos. Execute o script add_conferido_columns_to_melpethostel_documentos.sql.",
      });
    }

    const [existingRows] = await dbFor(req).query(
      `
        SELECT ${qcol(docsMeta.idCol)} AS id
        FROM MelPetHostel_Documentos
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
        UPDATE MelPetHostel_Documentos
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

      const meta = await getContratosTableMeta(req);
      if (
        !meta.exists ||
        !meta.loginCol ||
        !meta.nomeArquivoCol ||
        !meta.filePathCol
      ) {
        return res.status(500).json({
          status: "erro",
          mensagem:
            "Tabela MelPetHostel_Contratos não está pronta para upload (colunas obrigatórias ausentes).",
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
        if (meta.adminNotifiedAtCol) {
          setParts.push(`${qcol(meta.adminNotifiedAtCol)} = NULL`);
        }

        params.push(existingRow[meta.idCol]);

        await dbFor(req).query(
          `UPDATE MelPetHostel_Contratos SET ${setParts.join(", ")} WHERE ${qcol(meta.idCol)} = ?`,
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
        if (meta.adminNotifiedAtCol) {
          insertCols.push(meta.adminNotifiedAtCol);
          insertVals.push(null);
        }

        await dbFor(req).query(
          `INSERT INTO MelPetHostel_Contratos (${insertCols.map(qcol).join(", ")}) VALUES (${insertCols
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
          "Tabela MelPetHostel_Contratos não está pronta para verificação.",
      });
    }

    const latestContrato = await getLatestContratoRow(req, meta, login);
    if (!latestContrato || !latestContrato[meta.idCol]) {
      return res.json({ status: "sucesso", documentos: [] });
    }

    const contratoId = latestContrato[meta.idCol];
    const tipos = await getDocumentoTipos(req);

    const [docRows] = await dbFor(req).query(
      `
        SELECT Id, Usuario_ID, Contrato_ID, Documento_Tipo_ID, File_Path
        FROM MelPetHostel_Documentos
        WHERE Usuario_ID = ? AND Contrato_ID = ?
      `,
      [userRow.Usuario_ID, contratoId],
    );

    const docsByTipoId = new Map();
    for (const d of docRows || []) {
      const tipoId = Number(d.Documento_Tipo_ID);
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
        if (!candidate?.File_Path) continue;
        if (await fileExistsByStoredPath(candidate.File_Path)) {
          identifiedCount += 1;
        }
      }

      const existsDb = docsForTipo.some((candidate) =>
        Boolean(candidate?.File_Path),
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
        filePath: doc && doc.File_Path ? doc.File_Path : null,
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
          mensagem: "Usuário não encontrado na base MelPetHostel_Usuarios.",
        });
      }

      const meta = await getContratosTableMeta(req);
      if (!meta.exists || !meta.idCol) {
        return res.status(500).json({
          status: "erro",
          mensagem:
            "Tabela MelPetHostel_Contratos não está pronta para vincular documento (ID ausente).",
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

      const [existingRows] = await dbFor(req).query(
        `
          SELECT Id, File_Path
          FROM MelPetHostel_Documentos
          WHERE Usuario_ID = ? AND Contrato_ID = ? AND Documento_Tipo_ID = ?
          ORDER BY Id
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
            INSERT INTO MelPetHostel_Documentos (Usuario_ID, Contrato_ID, Documento_Tipo_ID, File_Path)
            VALUES (?, ?, ?, ?)
          `,
          [userRow.Usuario_ID, contratoId, tipo.Id, filePath],
        );
      } else if (existingRows && existingRows.length) {
        await dbFor(req).query(
          `
            UPDATE MelPetHostel_Documentos
            SET File_Path = ?
            WHERE Id = ?
          `,
          [filePath, existingRows[0].Id],
        );
      } else {
        await dbFor(req).query(
          `
            INSERT INTO MelPetHostel_Documentos (Usuario_ID, Contrato_ID, Documento_Tipo_ID, File_Path)
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
            "A base ainda está com chave única em MelPetHostel_Documentos. Execute o script API/scripts/drop_unique_mph_documentos.sql para permitir múltiplos 'Outros Documentos'.",
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
    const [rows] = await dbFor(req).query(
      "SELECT Grupo_ID AS id, Grupo_Nome AS nome, Created_At, Updated_At FROM MelPetHostel_Grupos ORDER BY Grupo_Nome",
    );
    return res.json(rows);
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

    await dbFor(req).query(
      "INSERT INTO MelPetHostel_Grupos (Grupo_Nome) VALUES (?)",
      [nome.trim()],
    );

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
    const [rows] = await dbFor(req).query(
      "SELECT Usuario_ID AS id, Usuario_Login AS login, Usuario_Grupo AS grupo, Created_At, Updated_At FROM MelPetHostel_Usuarios ORDER BY Usuario_Login",
    );
    return res.json(rows);
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

    await dbFor(req).query(
      "INSERT INTO MelPetHostel_Usuarios (Usuario_Login, Usuario_Senha, Usuario_Grupo) VALUES (?, ?, ?)",
      [login.trim(), senhaHash, grupo || null],
    );
    return res.json({ status: "sucesso", mensagem: "Usuário criado" });
  } catch (error) {
    console.error("Error in POST /melpethostel/users:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

module.exports = router;
