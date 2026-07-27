const dbPool = require("../config/database");
const TelegramBotPackage = require("node-telegram-bot-api");
const TelegramBot =
  TelegramBotPackage.TelegramBot ||
  TelegramBotPackage.default ||
  TelegramBotPackage;

const DEFAULT_MODULE = "melpethostel";
const DEFAULT_TIMEZONE = "America/Sao_Paulo";
const DEFAULT_CONFIG_RELOAD_MS = 60000;
const CONFIG_RELOAD_MS = positiveNumber(
  process.env.TELEGRAM_CONFIG_RELOAD_MS,
  DEFAULT_CONFIG_RELOAD_MS,
);

let serviceStarted = false;
let servicePollingEnabled = false;
let reloadTimer = null;
let reloadPromise = null;
let schemaPromise = null;
let schemaReady = false;

const botEntries = new Map();
const botInfoCache = new Map();
const botInfoPromise = new Map();

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeModule(module) {
  const value = clean(module)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return value || DEFAULT_MODULE;
}

function moduleDisplayName(module) {
  return normalizeModule(module)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

function asBool(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["true", "1", "yes", "sim", "on"].includes(
    String(value).trim().toLowerCase(),
  );
}

function maskToken(token) {
  const value = clean(token);
  if (!value) return "";
  if (value.length <= 12) return "********";
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

async function getTelegramBotInfo(token) {
  const cleanToken = clean(token);
  if (!cleanToken) {
    const err = new Error("Informe o token do bot.");
    err.statusCode = 400;
    throw err;
  }

  if (botInfoCache.has(cleanToken)) {
    return botInfoCache.get(cleanToken);
  }

  if (!botInfoPromise.has(cleanToken)) {
    botInfoPromise.set(
      cleanToken,
      (async () => {
        const testBot = new TelegramBot(cleanToken, { polling: false });
        const me = await testBot.getMe();
        if (!me || !me.username) {
          const err = new Error("Token do Telegram invalido.");
          err.statusCode = 400;
          throw err;
        }

        return {
          id: me.id,
          username: me.username,
          name: me.first_name || me.username,
        };
      })(),
    );
  }

  try {
    const info = await botInfoPromise.get(cleanToken);
    botInfoCache.set(cleanToken, info);
    return info;
  } finally {
    botInfoPromise.delete(cleanToken);
  }
}

async function ensureTelegramSchema(db = dbPool) {
  if (schemaReady) return;
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS TelegramUsers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        module VARCHAR(80) NOT NULL DEFAULT '${DEFAULT_MODULE}',
        app_user_login VARCHAR(255) NOT NULL,
        telegram_chat_id VARCHAR(50) DEFAULT NULL,
        token VARCHAR(128) DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        used_at DATETIME DEFAULT NULL,
        UNIQUE KEY uq_mph_tg_user_module (module, app_user_login),
        INDEX idx_mph_tg_chat_id (module, telegram_chat_id),
        INDEX idx_mph_tg_token (module, token),
        INDEX idx_mph_tg_module (module)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS TelegramBotConfig (
        id INT AUTO_INCREMENT PRIMARY KEY,
        module VARCHAR(80) NOT NULL DEFAULT '${DEFAULT_MODULE}',
        bot_token VARCHAR(255) NOT NULL,
        bot_username VARCHAR(255) DEFAULT NULL,
        bot_name VARCHAR(255) DEFAULT NULL,
        default_timezone VARCHAR(64) DEFAULT 'America/Sao_Paulo',
        polling_enabled TINYINT(1) NOT NULL DEFAULT 1,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        validated_at DATETIME DEFAULT NULL,
        UNIQUE KEY uq_mph_tg_bot_module (module)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS TelegramModuleNotifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        module VARCHAR(80) NOT NULL DEFAULT '${DEFAULT_MODULE}',
        admin_login VARCHAR(255) DEFAULT NULL,
        admin_logins TEXT DEFAULT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_mph_tg_module_notifications_module (module)
      )
    `);

    try {
      const [userLegacyColumns] = await db.query(
        `SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'TelegramUsers'
            AND COLUMN_NAME = 'module'
          LIMIT 1`,
      );

      if (!userLegacyColumns || !userLegacyColumns.length) {
        await db.query(
          `ALTER TABLE TelegramUsers ADD COLUMN module VARCHAR(80) NOT NULL DEFAULT '${DEFAULT_MODULE}' AFTER id`,
        );
      }

      const [botLegacyColumns] = await db.query(
        `SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'TelegramBotConfig'
            AND COLUMN_NAME = 'module'
          LIMIT 1`,
      );

      if (!botLegacyColumns || !botLegacyColumns.length) {
        await db.query(
          `ALTER TABLE TelegramBotConfig ADD COLUMN module VARCHAR(80) NOT NULL DEFAULT '${DEFAULT_MODULE}' AFTER id`,
        );
      }
    } catch (err) {
      console.warn(
        "[telegramService] Could not migrate telegram schema columns:",
        err.message || err,
      );
    }

    await db.query(
      `UPDATE TelegramUsers
          SET module = '${DEFAULT_MODULE}'
        WHERE module IS NULL OR module = ''`,
    );

    await db.query(
      `UPDATE TelegramBotConfig
          SET module = '${DEFAULT_MODULE}'
        WHERE module IS NULL OR module = ''`,
    );

    await db.query(
      `UPDATE TelegramModuleNotifications
          SET module = '${DEFAULT_MODULE}'
        WHERE module IS NULL OR module = ''`,
    );

    try {
      const [notifAdminLogins] = await db.query(
        `SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'TelegramModuleNotifications'
            AND COLUMN_NAME = 'admin_logins'
          LIMIT 1`,
      );

      if (!notifAdminLogins || !notifAdminLogins.length) {
        await db.query(
          "ALTER TABLE TelegramModuleNotifications ADD COLUMN admin_logins TEXT DEFAULT NULL AFTER admin_login",
        );
      }
    } catch (err) {
      console.warn(
        "[telegramService] Could not ensure TelegramModuleNotifications admin_logins column:",
        err.message || err,
      );
    }

    try {
      const [indexes] = await db.query(
        `SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_csv
           FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'TelegramUsers'
          GROUP BY INDEX_NAME, NON_UNIQUE`,
      );

      const legacyUserUnique = (indexes || []).find(
        (row) =>
          Number(row.NON_UNIQUE) === 0 && row.columns_csv === "app_user_login",
      );
      if (legacyUserUnique && legacyUserUnique.INDEX_NAME !== "PRIMARY") {
        await db.query(
          `ALTER TABLE TelegramUsers DROP INDEX ${legacyUserUnique.INDEX_NAME}`,
        );
      }

      const compositeUserUnique = (indexes || []).find(
        (row) =>
          Number(row.NON_UNIQUE) === 0 &&
          row.columns_csv === "module,app_user_login",
      );
      if (!compositeUserUnique) {
        await db.query(
          "ALTER TABLE TelegramUsers ADD UNIQUE KEY uq_mph_tg_user_module (module, app_user_login)",
        );
      }

      const tokenIndex = (indexes || []).find(
        (row) =>
          row.INDEX_NAME === "idx_mph_tg_token" &&
          row.columns_csv === "module,token",
      );
      if (!tokenIndex) {
        const tokenLegacy = (indexes || []).find(
          (row) => row.INDEX_NAME === "idx_mph_tg_token",
        );
        if (tokenLegacy) {
          await db.query(
            "ALTER TABLE TelegramUsers DROP INDEX idx_mph_tg_token",
          );
        }
        await db.query(
          "ALTER TABLE TelegramUsers ADD INDEX idx_mph_tg_token (module, token)",
        );
      }

      const chatIndex = (indexes || []).find(
        (row) =>
          row.INDEX_NAME === "idx_mph_tg_chat_id" &&
          row.columns_csv === "module,telegram_chat_id",
      );
      if (!chatIndex) {
        const chatLegacy = (indexes || []).find(
          (row) => row.INDEX_NAME === "idx_mph_tg_chat_id",
        );
        if (chatLegacy) {
          await db.query(
            "ALTER TABLE TelegramUsers DROP INDEX idx_mph_tg_chat_id",
          );
        }
        await db.query(
          "ALTER TABLE TelegramUsers ADD INDEX idx_mph_tg_chat_id (module, telegram_chat_id)",
        );
      }

      const [botIndexes] = await db.query(
        `SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_csv
           FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'TelegramBotConfig'
          GROUP BY INDEX_NAME, NON_UNIQUE`,
      );

      const botModuleUnique = (botIndexes || []).find(
        (row) => Number(row.NON_UNIQUE) === 0 && row.columns_csv === "module",
      );
      if (!botModuleUnique) {
        await db.query(
          "ALTER TABLE TelegramBotConfig ADD UNIQUE KEY uq_mph_tg_bot_module (module)",
        );
      }
    } catch (err) {
      console.warn(
        "[telegramService] Could not ensure telegram indexes:",
        err.message || err,
      );
    }
  })();

  try {
    await schemaPromise;
    schemaReady = true;
  } finally {
    schemaPromise = null;
  }
}

async function getStoredBotConfig(
  module = DEFAULT_MODULE,
  db = dbPool,
  { onlyActive = true } = {},
) {
  const moduleKey = normalizeModule(module);
  await ensureTelegramSchema(db);
  const [rows] = await db.query(
    `SELECT module, bot_token, bot_username, bot_name, default_timezone,
            polling_enabled, active, validated_at, updated_at
      FROM TelegramBotConfig
      WHERE module = ?
        ${onlyActive ? "AND active = 1" : ""}
      LIMIT 1`,
    [moduleKey],
  );

  if (!rows || !rows.length) return null;

  const row = rows[0];
  const token = clean(row.bot_token);
  return {
    saved: !!token,
    configured: !!token && asBool(row.active, false),
    source: "database",
    module: normalizeModule(row.module || moduleKey),
    token,
    username: clean(row.bot_username),
    name: clean(row.bot_name),
    defaultTimezone: clean(row.default_timezone) || DEFAULT_TIMEZONE,
    pollingEnabled: asBool(row.polling_enabled, true),
    active: asBool(row.active, false),
    validatedAt: row.validated_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function getActiveBotConfig(module = DEFAULT_MODULE, db = dbPool) {
  const moduleKey = normalizeModule(module);
  const cfg = await getStoredBotConfig(moduleKey, db, { onlyActive: true });

  if (!cfg || !cfg.token) {
    return {
      saved: false,
      configured: false,
      source: "none",
      module: moduleKey,
      token: "",
      username: "",
      name: "",
      defaultTimezone: DEFAULT_TIMEZONE,
      pollingEnabled: true,
      active: false,
      validatedAt: null,
      updatedAt: null,
    };
  }

  return {
    ...cfg,
    module: normalizeModule(cfg.module || moduleKey),
  };
}

async function getPublicBotConfig(module = DEFAULT_MODULE, db = dbPool) {
  let cfg =
    (await getStoredBotConfig(module, db, { onlyActive: false })) ||
    (await getActiveBotConfig(module, db));
  let validationError = "";

  if (cfg.active && cfg.token) {
    try {
      const botInfo = await getTelegramBotInfo(cfg.token);
      cfg = {
        ...cfg,
        username: botInfo.username,
        name: botInfo.name,
      };
    } catch (err) {
      validationError = err.message || "Nao foi possivel validar o bot.";
      cfg = {
        ...cfg,
        configured: false,
        username: "",
        name: "",
      };
    }
  }

  return {
    module: normalizeModule(cfg.module || module),
    saved: !!cfg.saved,
    configured: !!cfg.configured && !!cfg.active && !!cfg.token,
    active: !!cfg.active && !!cfg.token,
    source: cfg.source,
    username: cfg.username || "",
    name: cfg.name || "",
    defaultTimezone: cfg.defaultTimezone || DEFAULT_TIMEZONE,
    pollingEnabled: !!cfg.pollingEnabled,
    tokenMasked: cfg.token ? maskToken(cfg.token) : "",
    botLink: cfg.username ? `https://t.me/${cfg.username}` : "",
    validatedAt: cfg.validatedAt || null,
    updatedAt: cfg.updatedAt || null,
    validationError,
  };
}

async function validateTelegramBotToken(token) {
  return getTelegramBotInfo(token);
}

async function saveBotConfig(
  {
    module = DEFAULT_MODULE,
    token,
    defaultTimezone = DEFAULT_TIMEZONE,
    pollingEnabled = true,
  },
  db = dbPool,
) {
  await ensureTelegramSchema(db);
  const cleanToken = clean(token);
  const moduleKey = normalizeModule(module);
  const stored = cleanToken
    ? null
    : await getStoredBotConfig(moduleKey, db, { onlyActive: false });
  const effectiveToken = cleanToken || clean(stored && stored.token);
  const botInfo = await validateTelegramBotToken(effectiveToken);
  const timezone = clean(defaultTimezone) || DEFAULT_TIMEZONE;

  await db.query(
    `INSERT INTO TelegramBotConfig
       (module, bot_token, bot_username, bot_name, default_timezone, polling_enabled,
        active, created_at, updated_at, validated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       bot_token = VALUES(bot_token),
       bot_username = VALUES(bot_username),
       bot_name = VALUES(bot_name),
       default_timezone = VALUES(default_timezone),
       polling_enabled = VALUES(polling_enabled),
       active = 1,
       updated_at = NOW(),
       validated_at = NOW()`,
    [
      moduleKey,
      effectiveToken,
      botInfo.username,
      botInfo.name,
      timezone,
      asBool(pollingEnabled, true) ? 1 : 0,
    ],
  );

  if (serviceStarted) {
    await ensureBotForModule(moduleKey, {
      polling: servicePollingEnabled,
      force: true,
    });
  } else if (botEntries.has(moduleKey)) {
    await ensureBotForModule(moduleKey, { polling: false, force: true });
  }

  return getPublicBotConfig(moduleKey, db);
}

async function setBotConfigActive(
  module = DEFAULT_MODULE,
  active = true,
  db = dbPool,
) {
  const moduleKey = normalizeModule(module);
  await ensureTelegramSchema(db);
  const nextActive = asBool(active, false);

  if (nextActive) {
    const stored = await getStoredBotConfig(moduleKey, db, {
      onlyActive: false,
    });

    if (!stored || !stored.token) {
      const err = new Error("Salve o token do bot antes de ativar.");
      err.statusCode = 400;
      throw err;
    }

    const botInfo = await validateTelegramBotToken(stored.token);
    await db.query(
      `UPDATE TelegramBotConfig
          SET bot_username = ?,
              bot_name = ?,
              active = 1,
              updated_at = NOW(),
              validated_at = NOW()
        WHERE module = ?`,
      [botInfo.username, botInfo.name, moduleKey],
    );

    if (serviceStarted) {
      await ensureBotForModule(moduleKey, {
        polling: servicePollingEnabled,
        force: true,
      });
    } else if (botEntries.has(moduleKey)) {
      await ensureBotForModule(moduleKey, { polling: false, force: true });
    }

    return getPublicBotConfig(moduleKey, db);
  }

  await db.query(
    `UPDATE TelegramBotConfig
        SET active = 0,
            updated_at = NOW()
      WHERE module = ?`,
    [moduleKey],
  );

  if (botEntries.has(moduleKey)) {
    await stopBotForModule(moduleKey);
  }

  return getPublicBotConfig(moduleKey, db);
}

async function disableBotConfig(module = DEFAULT_MODULE, db = dbPool) {
  return setBotConfigActive(module, false, db);
}

async function getTelegramChatIdByLogin(
  module = DEFAULT_MODULE,
  login,
  db = dbPool,
) {
  const moduleKey = normalizeModule(module);
  const userLogin = clean(login);
  if (!userLogin) return null;

  await ensureTelegramSchema(db);
  const [rows] = await db.query(
    `SELECT telegram_chat_id
       FROM TelegramUsers
      WHERE module = ? AND app_user_login = ? AND telegram_chat_id IS NOT NULL
      LIMIT 1`,
    [moduleKey, userLogin],
  );

  return rows && rows.length && rows[0].telegram_chat_id
    ? String(rows[0].telegram_chat_id)
    : null;
}

async function getModuleAccessNotificationConfig(
  module = DEFAULT_MODULE,
  db = dbPool,
) {
  const moduleKey = normalizeModule(module);
  await ensureTelegramSchema(db);

  const [rows] = await db.query(
    `SELECT module, admin_login, admin_logins, enabled
       FROM TelegramModuleNotifications
      WHERE module = ?
      LIMIT 1`,
    [moduleKey],
  );

  const row = rows && rows.length ? rows[0] : null;
  const legacyAdminLogin = clean(row && row.admin_login);
  let adminLogins = [];

  if (row && row.admin_logins) {
    try {
      const parsed = JSON.parse(row.admin_logins);
      if (Array.isArray(parsed)) {
        adminLogins = parsed.map((value) => clean(value)).filter(Boolean);
      }
    } catch {
      // Fallback to the legacy single-admin column.
    }
  }

  if (!adminLogins.length && legacyAdminLogin) {
    adminLogins = [legacyAdminLogin];
  }

  const adminChatIds = {};
  for (const adminLogin of adminLogins) {
    const chatId = await getTelegramChatIdByLogin(moduleKey, adminLogin, db);
    if (chatId) adminChatIds[adminLogin] = chatId;
  }

  const firstLogin = adminLogins.length ? adminLogins[0] : legacyAdminLogin;
  const firstChatId = firstLogin
    ? adminChatIds[firstLogin] ||
      (await getTelegramChatIdByLogin(moduleKey, firstLogin, db))
    : null;

  return {
    module: moduleKey,
    enabled: row ? asBool(row.enabled, false) : false,
    adminLogin: firstLogin || "",
    adminChatId: firstChatId || null,
    adminLinked: !!firstChatId,
    adminLogins,
    adminChatIds,
  };
}

async function saveModuleAccessNotificationConfig(
  {
    module = DEFAULT_MODULE,
    adminLogins = null,
    adminLogin = null,
    enabled = false,
  },
  db = dbPool,
) {
  const moduleKey = normalizeModule(module);
  await ensureTelegramSchema(db);

  let logins = [];
  if (Array.isArray(adminLogins)) {
    logins = adminLogins.map((value) => clean(value)).filter(Boolean);
  } else if (adminLogin) {
    const login = clean(adminLogin);
    if (login) logins = [login];
  }

  if (enabled && !logins.length) {
    const error = new Error(
      "Selecione pelo menos um administrador para receber a notificacao.",
    );
    error.statusCode = 400;
    throw error;
  }

  const adminLoginToSave = logins.length ? logins[0] : null;
  const adminLoginsToSave = logins.length ? JSON.stringify(logins) : null;

  await db.query(
    `INSERT INTO TelegramModuleNotifications
       (module, admin_login, admin_logins, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       admin_login = VALUES(admin_login),
       admin_logins = VALUES(admin_logins),
       enabled = VALUES(enabled),
       updated_at = NOW()`,
    [moduleKey, adminLoginToSave, adminLoginsToSave, enabled ? 1 : 0],
  );

  return getModuleAccessNotificationConfig(moduleKey, db);
}

async function stopBotForModule(module = DEFAULT_MODULE) {
  const moduleKey = normalizeModule(module);
  const entry = botEntries.get(moduleKey);
  if (!entry) return;

  botEntries.delete(moduleKey);

  try {
    entry.bot.removeAllListeners();
  } catch {
    // ignore
  }

  try {
    await entry.bot.stopPolling({ cancel: true });
  } catch {
    // The bot may not be polling in the web process.
  }
}

async function stopAllBots() {
  const modules = [...botEntries.keys()];
  for (const moduleKey of modules) {
    await stopBotForModule(moduleKey);
  }
}

async function sendSafe(activeBot, chatId, message) {
  try {
    await activeBot.sendMessage(chatId, message);
  } catch (e) {
    console.error(
      "[telegramService] Could not send Telegram reply:",
      e.message || e,
    );
  }
}

function attachTelegramHandlers(activeBot, module = DEFAULT_MODULE) {
  const moduleKey = normalizeModule(module);
  activeBot.onText(/\/start(?:@\w+)?(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg && msg.chat && msg.chat.id;
    const linkToken = clean(match && match[1]);

    if (!chatId) return;

    if (!linkToken) {
      await sendSafe(
        activeBot,
        chatId,
        "Abra o link gerado no sistema para vincular este Telegram.",
      );
      return;
    }

    try {
      await ensureTelegramSchema(dbPool);
      const [rows] = await dbPool.query(
        "SELECT app_user_login, telegram_chat_id, module FROM TelegramUsers WHERE module = ? AND token = ? LIMIT 1",
        [moduleKey, linkToken],
      );

      if (!rows || !rows.length) {
        await sendSafe(activeBot, chatId, "Token de vinculacao invalido.");
        return;
      }

      const appUser = clean(rows[0].app_user_login);
      const nextChatId = String(chatId);
      await dbPool.query(
        "UPDATE TelegramUsers SET telegram_chat_id = ?, used_at = NOW() WHERE module = ? AND app_user_login = ?",
        [nextChatId, moduleKey, appUser],
      );

      await sendSafe(
        activeBot,
        chatId,
        `Telegram vinculado com sucesso no sistema ${moduleDisplayName(moduleKey)}.`,
      );
      console.log("[telegramService] Linked Telegram chat", {
        module: moduleKey,
        app_user: appUser,
        chatId,
      });
    } catch (err) {
      await sendSafe(
        activeBot,
        chatId,
        "Nao foi possivel concluir a vinculacao. Tente novamente pelo sistema.",
      );
      console.error("telegramService error handling /start:", err);
    }
  });

  activeBot.on("polling_error", (err) => {
    console.error(
      "[telegramService] polling_error:",
      err && err.message ? err.message : err,
    );
  });
}

async function ensureBotForModule(
  module = DEFAULT_MODULE,
  { polling = false, force = false, db = dbPool } = {},
) {
  const moduleKey = normalizeModule(module);
  const cfg = await getActiveBotConfig(moduleKey, db);
  const shouldPoll = !!polling && cfg.pollingEnabled !== false;
  const nextFingerprint = `${cfg.source}:${cfg.token}:${shouldPoll}`;
  const existing = botEntries.get(moduleKey);

  if (!cfg.configured || !cfg.token) {
    if (existing) {
      await stopBotForModule(moduleKey);
    }
    console.warn(`Telegram bot not configured - service idle for ${moduleKey}`);
    return null;
  }

  if (!force && existing && existing.fingerprint === nextFingerprint) {
    return existing.bot;
  }

  if (existing) {
    await stopBotForModule(moduleKey);
  }

  const nextBot = new TelegramBot(cfg.token, { polling: shouldPoll });
  attachTelegramHandlers(nextBot, moduleKey);

  botEntries.set(moduleKey, {
    bot: nextBot,
    fingerprint: nextFingerprint,
    config: cfg,
  });

  console.log(
    "Telegram service ready",
    moduleDisplayName(moduleKey),
    cfg.username ? `@${cfg.username}` : "",
    shouldPoll ? "(polling)" : "(send only)",
  );

  return nextBot;
}

async function getConfiguredModules(db = dbPool) {
  await ensureTelegramSchema(db);
  const [rows] = await db.query(
    `SELECT DISTINCT module
      FROM TelegramBotConfig
      WHERE active = 1 AND bot_token IS NOT NULL AND bot_token <> ''`,
  );

  return Array.from(
    new Set((rows || []).map((row) => normalizeModule(row.module))),
  );
}

async function ensureAllBots({
  polling = false,
  force = false,
  db = dbPool,
} = {}) {
  const modules = await getConfiguredModules(db);
  const activeModules = new Set(modules);

  for (const moduleKey of modules) {
    await ensureBotForModule(moduleKey, { polling, force, db });
  }

  for (const moduleKey of [...botEntries.keys()]) {
    if (!activeModules.has(moduleKey)) {
      await stopBotForModule(moduleKey);
    }
  }
}

async function reloadTelegramBots({ polling = servicePollingEnabled, force = false } = {}) {
  if (reloadPromise) return reloadPromise;

  reloadPromise = (async () => {
    try {
      await ensureAllBots({ polling, force });
      return true;
    } catch (err) {
      console.error(
        "Failed to reload Telegram bot config:",
        err.message || err,
      );
      return false;
    }
  })();

  try {
    return await reloadPromise;
  } finally {
    reloadPromise = null;
  }
}

function scheduleTelegramConfigReload() {
  if (reloadTimer) clearInterval(reloadTimer);

  reloadTimer = setInterval(() => {
    reloadTelegramBots({ polling: servicePollingEnabled }).catch((err) => {
      console.error("Unexpected Telegram reload error:", err.message || err);
    });
  }, CONFIG_RELOAD_MS);

  if (reloadTimer && typeof reloadTimer.unref === "function") {
    reloadTimer.unref();
  }
}

async function startTelegramService({ polling = true } = {}) {
  if (serviceStarted) return false;

  serviceStarted = true;
  servicePollingEnabled = !!polling;

  scheduleTelegramConfigReload();
  await reloadTelegramBots({ polling: servicePollingEnabled, force: true });

  console.log(
    "Telegram background service started",
    servicePollingEnabled ? "(polling)" : "(send only)",
  );

  return true;
}

async function stopTelegramService() {
  if (!serviceStarted && !botEntries.size) {
    return false;
  }

  serviceStarted = false;
  servicePollingEnabled = false;

  if (reloadTimer) {
    clearInterval(reloadTimer);
    reloadTimer = null;
  }

  await stopAllBots();
  return true;
}

async function getBotForSend(module = DEFAULT_MODULE, db = dbPool) {
  const moduleKey = normalizeModule(module);
  const cfg = await getActiveBotConfig(moduleKey, db);
  const existing = botEntries.get(moduleKey);

  if (!cfg.configured || !cfg.token) {
    if (existing) await stopBotForModule(moduleKey);
    return null;
  }

  if (
    existing &&
    existing.config &&
    clean(existing.config.token) === clean(cfg.token)
  ) {
    return existing.bot;
  }

  return ensureBotForModule(moduleKey, { polling: false, force: true, db });
}

async function sendTelegram(chatId, text, options = {}) {
  const module =
    typeof options === "string"
      ? options
      : normalizeModule(options.module || DEFAULT_MODULE);
  const activeBot = await getBotForSend(module, options.db || dbPool);
  if (!activeBot) throw new Error("Telegram bot not configured");
  if (!chatId) throw new Error("Missing chatId");
  return activeBot.sendMessage(chatId, String(text), { parse_mode: "HTML" });
}

module.exports = {
  DEFAULT_TIMEZONE,
  DEFAULT_MODULE,
  ensureTelegramSchema,
  getActiveBotConfig,
  getPublicBotConfig,
  saveBotConfig,
  setBotConfigActive,
  disableBotConfig,
  getTelegramChatIdByLogin,
  getModuleAccessNotificationConfig,
  saveModuleAccessNotificationConfig,
  validateTelegramBotToken,
  startTelegramService,
  stopTelegramService,
  ensureBotForModule,
  ensureAllBots,
  stopBotForModule,
  sendTelegram,
  normalizeModule,
  maskToken,
  get currentConfig() {
    const defaultEntry = botEntries.get(DEFAULT_MODULE) || null;
    return defaultEntry ? defaultEntry.config : null;
  },
  get bot() {
    const defaultEntry = botEntries.get(DEFAULT_MODULE) || null;
    return defaultEntry ? defaultEntry.bot : null;
  },
};
