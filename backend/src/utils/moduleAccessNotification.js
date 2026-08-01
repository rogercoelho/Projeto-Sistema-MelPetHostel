const {
  getModuleAccessNotificationConfig,
  getTelegramChatIdByLogin,
  normalizeModule,
  sendTelegram,
} = require("../services/telegramService");
const { sanitizePart } = require("./uploadsUtils");

const MODULE = normalizeModule("melpethostel");

async function notifyMelPetHostelLoginAccess(req, login) {
  const safeLogin = sanitizePart(login);
  if (!safeLogin) return { notified: false, reason: "sem_usuario" };

  const db = req && req.db ? req.db : require("../config/database");
  const config = await getModuleAccessNotificationConfig(MODULE, db);
  if (!config.enabled || !config.adminLogins || !config.adminLogins.length) {
    return { notified: false, reason: "desativado" };
  }

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
    } catch (error) {
      console.error(
        "notifyMelPetHostelLoginAccess error sending to",
        adminLogin,
        error?.message || error,
      );
    }
  }

  return {
    notified: Boolean(notifiedTo.length),
    notifiedTo,
  };
}

module.exports = {
  MODULE,
  notifyMelPetHostelLoginAccess,
};
