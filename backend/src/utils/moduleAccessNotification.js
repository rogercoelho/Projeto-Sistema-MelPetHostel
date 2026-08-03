const {
  getModuleAccessNotificationConfig,
  normalizeModule,
  sendTelegram,
} = require("../services/telegramService");
const { sanitizePart } = require("./uploadsUtils");

const MODULE = normalizeModule("melpethostel");

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
  const safeLogin = sanitizePart(login);
  if (!safeLogin) return { notified: false, reason: "sem_usuario" };

  const db = req && req.db ? req.db : require("../config/database");
  const message = `Módulo Mel Pet Hostel\nO usuário <b>${safeLogin}</b> acessou o Módulo Mel Pet Hostel.`;

  return sendTelegramToConfiguredAdmins({
    db,
    module: MODULE,
    message,
    disabledReason: "desativado",
  });
}

module.exports = {
  MODULE,
  notifyMelPetHostelLoginAccess,
  sendTelegramToConfiguredAdmins,
};
