const {
  DEFAULT_TIMEZONE,
  getModuleAccessNotificationConfig,
  normalizeModule,
  sendTelegram,
} = require("../services/telegramService");

const MODULE = normalizeModule("melpethostel");

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function uniqueCleanList(values) {
  const seen = new Set();
  const result = [];

  for (const value of values || []) {
    const item = clean(value);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }

  return result;
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getTelegramDateTime(value = new Date()) {
  const timezone =
    clean(process.env.TELEGRAM_DEFAULT_TIMEZONE) || DEFAULT_TIMEZONE;
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(value)
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const hour = parts.hour === "24" ? "00" : parts.hour;

  return {
    date: `${parts.day}/${parts.month}/${parts.year}`,
    time: `${hour}:${parts.minute}`,
  };
}

function getUsuarioDisplayName(usuario, fallbackLogin) {
  return (
    clean(usuario?.cliente?.nome) ||
    clean(usuario?.cliente_nome) ||
    clean(usuario?.Cliente_Nome) ||
    clean(usuario?.nome) ||
    clean(usuario?.Usuario_Login) ||
    clean(usuario?.login) ||
    clean(fallbackLogin) ||
    "Usuário não identificado"
  );
}

async function sendTelegramToConfiguredAdmins({
  db,
  module = MODULE,
  message,
  disabledReason = "desativado",
}) {
  const moduleKey = normalizeModule(module);
  const config = await getModuleAccessNotificationConfig(moduleKey, db);
  if (!config.enabled || !config.adminLogins || !config.adminLogins.length) {
    return { notified: false, reason: disabledReason };
  }

  const notifiedTo = [];
  const sentChatIds = new Set();

  for (const adminLogin of config.adminLogins) {
    const chatId = config.adminChatIds && config.adminChatIds[adminLogin];
    if (!chatId) continue;

    const chatKey = String(chatId);
    if (sentChatIds.has(chatKey)) continue;
    sentChatIds.add(chatKey);

    try {
      await sendTelegram(chatId, message, { module: moduleKey, db });
      notifiedTo.push({ adminLogin, chatId });
    } catch (error) {
      console.error(
        "sendTelegramToConfiguredAdmins error sending to",
        adminLogin,
        error && error.message ? error.message : error,
      );
    }
  }

  return {
    notified: Boolean(notifiedTo.length),
    notifiedTo,
  };
}

async function notifyMelPetHostelLoginAccess(req, login) {
  const safeLogin = clean(login);
  if (!safeLogin) return { notified: false, reason: "sem_usuario" };

  const db = req && req.db ? req.db : require("../config/database");
  const message = `Módulo Mel Pet Hostel\nO usuário <b>${escapeHtml(safeLogin)}</b> acessou o Módulo Mel Pet Hostel.`;

  return sendTelegramToConfiguredAdmins({
    db,
    module: MODULE,
    message,
    disabledReason: "desativado",
  });
}

async function notifyDocumentUploadForReview(
  req,
  { usuario = null, login = "", documentNames = [], occurredAt = new Date() } = {},
) {
  const names = uniqueCleanList(
    Array.isArray(documentNames) ? documentNames : [documentNames],
  );

  if (!names.length) {
    return { notified: false, reason: "sem_documentos" };
  }

  const db = req && req.db ? req.db : require("../config/database");
  const usuarioNome = getUsuarioDisplayName(usuario, login);
  const { date, time } = getTelegramDateTime(occurredAt);
  const plural = names.length > 1;

  const message = [
    `<b>${plural ? "Documentos enviados" : "Documento enviado"} para conferência</b>`,
    `Usuário: <b>${escapeHtml(usuarioNome)}</b>`,
    `${plural ? "Documentos" : "Documento"}: <b>${names.map(escapeHtml).join(", ")}</b>`,
    `Data: <b>${date}</b>`,
    `Hora: <b>${time}</b>`,
  ].join("\n");

  return sendTelegramToConfiguredAdmins({
    db,
    module: MODULE,
    message,
    disabledReason: "notificacao_desativada",
  });
}

module.exports = {
  MODULE,
  notifyDocumentUploadForReview,
  notifyMelPetHostelLoginAccess,
  sendTelegramToConfiguredAdmins,
};
