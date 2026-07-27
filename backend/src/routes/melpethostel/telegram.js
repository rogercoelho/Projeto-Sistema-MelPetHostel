const express = require("express");
const router = express.Router();
const dbFor = require("../../utils/dbFor");
const crypto = require("crypto");
const {
  DEFAULT_TIMEZONE,
  disableBotConfig,
  ensureTelegramSchema,
  getActiveBotConfig,
  getModuleAccessNotificationConfig,
  getTelegramChatIdByLogin,
  getPublicBotConfig,
  normalizeModule,
  saveBotConfig,
  saveModuleAccessNotificationConfig,
  sendTelegram,
  setBotConfigActive,
} = require("../../services/telegramService");

const DEFAULT_MODULE = "melpethostel";

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function getUserLogin(req) {
  return (
    clean(req?.user?.login) ||
    clean(req?.headers?.["x-user"]) ||
    clean(req?.body?.login)
  );
}

function requireUser(req, res) {
  const userLogin = getUserLogin(req);
  if (!userLogin) {
    res
      .status(403)
      .json({ status: "erro", mensagem: "Usuario nao autenticado" });
    return null;
  }
  return String(userLogin).trim();
}

function isAdminUser(req) {
  const user = (req && req.user) || {};
  const values = [
    user.grupoNome,
    user.grupo,
    user.perfil,
    user.role,
    user.tipo,
  ];

  return Boolean(
    user.admin ||
    user.isAdmin ||
    user.source === "usuarios" ||
    values.some((value) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes("admin"),
    ),
  );
}

function requireAdmin(req, res) {
  if (!isAdminUser(req)) {
    res.status(403).json({
      status: "erro",
      mensagem: "Apenas administradores podem configurar o bot do Telegram.",
    });
    return false;
  }
  return true;
}

function isAdminGroupValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .includes("admin");
}

async function getAdminUsersWithTelegram(req, module) {
  const db = dbFor(req);
  const moduleKey = normalizeModule(module);
  await ensureTelegramSchema(db);

  const [users] = await db.query(
    `SELECT Usuario_ID AS id,
            Usuario_Login AS login,
            Usuario_Grupo AS grupo
       FROM Usuarios
      ORDER BY Usuario_Login`,
  );
  const admins = (users || []).filter((user) => isAdminGroupValue(user.grupo));

  if (!admins.length) return [];

  const logins = admins.map((user) => clean(user.login)).filter(Boolean);
  if (!logins.length) return [];

  const placeholders = logins.map(() => "?").join(",");
  const [telegramRows] = await db.query(
    `SELECT app_user_login, telegram_chat_id
       FROM TelegramUsers
      WHERE module = ? AND app_user_login IN (${placeholders})`,
    [moduleKey, ...logins],
  );

  const telegramByLogin = new Map();
  for (const row of telegramRows || []) {
    const login = clean(row.app_user_login);
    if (login) telegramByLogin.set(login, clean(row.telegram_chat_id));
  }

  return admins.map((user) => {
    const login = clean(user.login);
    const chatId = telegramByLogin.get(login) || "";
    return {
      id: user.id,
      login,
      grupo: clean(user.grupo),
      telegram_chat_id: chatId,
      linked: !!chatId,
    };
  });
}

function getModuleFromRequest(req) {
  const raw = req.query?.module ?? req.body?.module ?? DEFAULT_MODULE;
  return normalizeModule(raw || DEFAULT_MODULE);
}

function moduleDisplayName(module) {
  const value = normalizeModule(module);
  if (value === "melpethostel") return "Mel Pet Hostel";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function handleError(res, err) {
  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    status: "erro",
    mensagem: err.message || String(err),
  });
}

router.get("/bot", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const db = dbFor(req);
    await ensureTelegramSchema(db);
    const module = getModuleFromRequest(req);
    res.json(await getPublicBotConfig(module, db));
  } catch (err) {
    console.error("Error in GET /melpethostel/telegram/bot:", err);
    handleError(res, err);
  }
});

router.post("/bot", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const db = dbFor(req);
    const { botToken, token, defaultTimezone, pollingEnabled, module } =
      req.body || {};
    const moduleKey = normalizeModule(
      module || req.query?.module || DEFAULT_MODULE,
    );
    const activeConfig = await getActiveBotConfig(moduleKey, db);
    const saved = await saveBotConfig(
      {
        module: moduleKey,
        token: clean(botToken || token) || activeConfig.token,
        defaultTimezone:
          clean(defaultTimezone) ||
          activeConfig.defaultTimezone ||
          DEFAULT_TIMEZONE,
        pollingEnabled:
          pollingEnabled === undefined || pollingEnabled === null
            ? activeConfig.pollingEnabled
            : pollingEnabled,
      },
      db,
    );

    res.json(saved);
  } catch (err) {
    console.error("Error in POST /melpethostel/telegram/bot:", err);
    handleError(res, err);
  }
});

router.delete("/bot", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const db = dbFor(req);
    const module = getModuleFromRequest(req);
    const next = await disableBotConfig(module, db);
    res.json({
      status: "sucesso",
      mensagem: "Configuracao do bot desativada.",
      bot: next,
    });
  } catch (err) {
    console.error("Error in DELETE /melpethostel/telegram/bot:", err);
    handleError(res, err);
  }
});

router.post("/bot/status", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const db = dbFor(req);
    const module = getModuleFromRequest(req);
    const active = req.body?.active;

    if (active === undefined || active === null) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Informe se o bot deve ficar ativo ou inativo.",
      });
    }

    const next = await setBotConfigActive(module, active, db);

    res.json({
      status: "sucesso",
      mensagem: next.active ? "Bot ativado." : "Bot desativado.",
      bot: next,
    });
  } catch (err) {
    console.error("Error in POST /melpethostel/telegram/bot/status:", err);
    handleError(res, err);
  }
});

router.post("/link", async (req, res) => {
  try {
    const userLogin = requireUser(req, res);
    if (!userLogin) return;

    const db = dbFor(req);
    await ensureTelegramSchema(db);
    const module = getModuleFromRequest(req);
    const targetLogin = clean(
      req.body?.targetLogin || req.body?.login || req.query?.targetLogin,
    );
    const effectiveLogin = targetLogin || userLogin;

    if (targetLogin && !isAdminUser(req)) {
      return res.status(403).json({
        status: "erro",
        mensagem: "Apenas administradores podem vincular outra conta.",
      });
    }

    const botConfig = await getPublicBotConfig(module, db);
    if (!botConfig.configured || !botConfig.username) {
      return res.status(400).json({
        status: "erro",
        mensagem:
          botConfig.validationError ||
          "Configure e ative o bot do Telegram antes de gerar o link de vinculo.",
      });
    }

    const [existingRows] = await db.query(
      `SELECT token, telegram_chat_id
         FROM TelegramUsers
        WHERE module = ? AND app_user_login = ?
        LIMIT 1`,
      [module, effectiveLogin],
    );
    const existing =
      existingRows && existingRows.length ? existingRows[0] : null;
    const token =
      clean(existing && existing.token) ||
      crypto.randomBytes(16).toString("hex");

    if (existing) {
      if (!clean(existing.token)) {
        await db.query(
          `UPDATE TelegramUsers
              SET token = ?,
                  created_at = COALESCE(created_at, NOW())
            WHERE module = ? AND app_user_login = ?`,
          [token, module, effectiveLogin],
        );
      }
    } else {
      await db.query(
        `INSERT INTO TelegramUsers
           (module, app_user_login, token, created_at, used_at, telegram_chat_id)
         VALUES (?, ?, ?, NOW(), NULL, NULL)`,
        [module, effectiveLogin, token],
      );
    }

    const encodedToken = encodeURIComponent(token);
    const link = `https://t.me/${botConfig.username}?start=${encodedToken}`;
    const tgLink = `tg://resolve?domain=${encodeURIComponent(
      botConfig.username,
    )}&start=${encodedToken}`;
    res.json({
      token,
      link,
      tgLink,
      bot: botConfig,
      app_user_login: effectiveLogin,
      linked: !!clean(existing && existing.telegram_chat_id),
    });
  } catch (err) {
    console.error("Error in POST /melpethostel/telegram/link:", err);
    handleError(res, err);
  }
});

router.delete("/link", async (req, res) => {
  try {
    const userLogin = requireUser(req, res);
    if (!userLogin) return;

    const db = dbFor(req);
    await ensureTelegramSchema(db);
    const module = getModuleFromRequest(req);
    const targetLogin = clean(
      req.body?.targetLogin || req.body?.login || req.query?.targetLogin,
    );
    const effectiveLogin = targetLogin || userLogin;

    if (targetLogin && !isAdminUser(req)) {
      return res.status(403).json({
        status: "erro",
        mensagem: "Apenas administradores podem desvincular outra conta.",
      });
    }

    await db.query(
      `UPDATE TelegramUsers
          SET telegram_chat_id = NULL,
              token = NULL,
              used_at = NULL
        WHERE module = ? AND app_user_login = ?`,
      [module, effectiveLogin],
    );

    res.json({
      status: "sucesso",
      mensagem: "Telegram desvinculado com sucesso.",
      linked: false,
      app_user_login: effectiveLogin,
    });
  } catch (err) {
    console.error("Error in DELETE /melpethostel/telegram/link:", err);
    handleError(res, err);
  }
});

router.get("/admins", async (req, res) => {
  try {
    const userLogin = requireUser(req, res);
    if (!userLogin) return;

    if (!isAdminUser(req)) {
      return res.status(403).json({
        status: "erro",
        mensagem: "Apenas administradores podem consultar esta lista.",
      });
    }

    const module = getModuleFromRequest(req);
    const admins = await getAdminUsersWithTelegram(req, module);
    res.json({ module, admins });
  } catch (err) {
    console.error("Error in GET /melpethostel/telegram/admins:", err);
    handleError(res, err);
  }
});

router.get("/access-notification", async (req, res) => {
  try {
    const userLogin = requireUser(req, res);
    if (!userLogin) return;

    if (!isAdminUser(req)) {
      return res.status(403).json({
        status: "erro",
        mensagem: "Apenas administradores podem configurar notificacoes.",
      });
    }

    const db = dbFor(req);
    const module = getModuleFromRequest(req);
    const config = await getModuleAccessNotificationConfig(module, db);
    const admins = await getAdminUsersWithTelegram(req, module);
    res.json({ module, config, admins });
  } catch (err) {
    console.error(
      "Error in GET /melpethostel/telegram/access-notification:",
      err,
    );
    handleError(res, err);
  }
});

router.post("/access-notification", async (req, res) => {
  try {
    const userLogin = requireUser(req, res);
    if (!userLogin) return;

    if (!isAdminUser(req)) {
      return res.status(403).json({
        status: "erro",
        mensagem: "Apenas administradores podem configurar notificacoes.",
      });
    }

    const db = dbFor(req);
    const module = getModuleFromRequest(req);
    const enabled = req.body?.enabled !== undefined ? req.body.enabled : true;

    // accept either adminLogins array or single adminLogin for backward compat
    let adminLogins = req.body?.adminLogins;
    const single = clean(req.body?.adminLogin || req.body?.login);
    if (!Array.isArray(adminLogins)) {
      adminLogins = single ? [single] : [];
    }

    const admins = await getAdminUsersWithTelegram(req, module);
    const allowedLogins = new Set(
      admins.filter((a) => a.linked).map((a) => clean(a.login)),
    );

    const invalid = (adminLogins || []).find(
      (al) => !allowedLogins.has(clean(al)),
    );

    if (enabled && invalid) {
      return res.status(400).json({
        status: "erro",
        mensagem:
          "Selecione apenas administradores que ja tenham Telegram vinculado neste sistema.",
      });
    }

    const saved = await saveModuleAccessNotificationConfig(
      {
        module,
        adminLogins: enabled ? adminLogins : [],
        enabled: Boolean(enabled),
      },
      db,
    );

    res.json({ status: "sucesso", config: saved });
  } catch (err) {
    console.error(
      "Error in POST /melpethostel/telegram/access-notification:",
      err,
    );
    handleError(res, err);
  }
});

router.get("/status", async (req, res) => {
  try {
    const userLogin = requireUser(req, res);
    if (!userLogin) return;

    const db = dbFor(req);
    await ensureTelegramSchema(db);
    const module = getModuleFromRequest(req);
    const targetLogin = clean(
      req.query?.targetLogin || req.body?.targetLogin || req.body?.login,
    );
    const effectiveLogin = targetLogin || userLogin;

    if (targetLogin && !isAdminUser(req)) {
      return res.status(403).json({
        status: "erro",
        mensagem: "Apenas administradores podem consultar outra conta.",
      });
    }

    const [rows] = await db.query(
      `SELECT app_user_login, telegram_chat_id, used_at, created_at
         FROM TelegramUsers
        WHERE module = ? AND app_user_login = ?
        LIMIT 1`,
      [module, effectiveLogin],
    );

    const row = rows && rows.length ? rows[0] : {};
    const chatId = row.telegram_chat_id || "";
    res.json({
      app_user_login: effectiveLogin,
      module,
      telegram_chat_id: chatId,
      linked: !!chatId,
      used_at: row.used_at || null,
      created_at: row.created_at || null,
      bot: await getPublicBotConfig(module, db),
    });
  } catch (err) {
    console.error("Error in GET /melpethostel/telegram/status:", err);
    handleError(res, err);
  }
});

router.post("/test", async (req, res) => {
  try {
    const userLogin = requireUser(req, res);
    if (!userLogin) return;

    const db = dbFor(req);
    await ensureTelegramSchema(db);
    const module = getModuleFromRequest(req);
    const targetLogin = clean(
      req.query?.targetLogin || req.body?.targetLogin || req.body?.login,
    );
    const effectiveLogin = targetLogin || userLogin;

    if (targetLogin && !isAdminUser(req)) {
      return res.status(403).json({
        status: "erro",
        mensagem: "Apenas administradores podem testar outra conta.",
      });
    }

    const [rows] = await db.query(
      `SELECT telegram_chat_id
         FROM TelegramUsers
        WHERE module = ? AND app_user_login = ? AND telegram_chat_id IS NOT NULL
        LIMIT 1`,
      [module, effectiveLogin],
    );

    const chatId = rows && rows.length ? rows[0].telegram_chat_id : null;
    if (!chatId) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Vincule seu Telegram antes de enviar o teste.",
      });
    }

    await sendTelegram(
      chatId,
      "Mensagem de teste enviada pelo sistema Mel Pet Hostel",
      { module },
    );
    res.json({ status: "sucesso", mensagem: "Mensagem de teste enviada." });
  } catch (err) {
    console.error("Error in POST /melpethostel/telegram/test:", err);
    handleError(res, err);
  }
});

router.post("/acesso", async (req, res) => {
  try {
    const userLogin = requireUser(req, res);
    if (!userLogin) return;

    const db = dbFor(req);
    await ensureTelegramSchema(db);
    const module = getModuleFromRequest(req);
    const config = await getModuleAccessNotificationConfig(module, db);

    if (!config.enabled || !config.adminLogins || !config.adminLogins.length) {
      return res.json({
        status: "sucesso",
        notified: false,
        module,
      });
    }

    const safeLogin = clean(userLogin);
    const message = `Sistema ${moduleDisplayName(module)}\nO usuario <b>${safeLogin}</b> acessou o sistema ${moduleDisplayName(module)}.`;

    const notifiedTo = [];
    for (const adminLogin of config.adminLogins) {
      const chatId =
        (config.adminChatIds && config.adminChatIds[adminLogin]) ||
        (await getTelegramChatIdByLogin(module, adminLogin, db));
      if (!chatId) continue;
      try {
        await sendTelegram(chatId, message, { module });
        notifiedTo.push({ adminLogin, chatId });
      } catch (e) {
        console.error(
          "Error sending access notification to",
          adminLogin,
          e && e.message ? e.message : e,
        );
      }
    }

    res.json({
      status: "sucesso",
      notified: !!notifiedTo.length,
      module,
      notifiedTo,
    });
  } catch (err) {
    console.error("Error in POST /melpethostel/telegram/acesso:", err);
    handleError(res, err);
  }
});

module.exports = router;
