import { api } from "../../services/api";

export const TELEGRAM_MODULE = "melpethostel";
export const TELEGRAM_TIMEZONE = "America/Sao_Paulo";
export const TELEGRAM_DEFAULT_TEST_MESSAGE =
  "Mensagem de teste enviada pelo sistema Mel Pet Hostel";

export function createEmptyBot(moduleKey = TELEGRAM_MODULE) {
  return {
    module: moduleKey,
    saved: false,
    configured: false,
    active: false,
    username: "",
    name: "",
    defaultTimezone: TELEGRAM_TIMEZONE,
    pollingEnabled: true,
    tokenMasked: "",
    validationError: "",
  };
}

export function getTelegramStatusInfo(bot) {
  if (bot?.validationError) {
    return {
      label: "Erro",
      tone: "erro",
      description: bot.validationError,
    };
  }

  if (bot?.active && bot?.configured) {
    return {
      label: "Ativo",
      tone: "sucesso",
      description: "Bot configurado, ativo e pronto para notificacoes.",
    };
  }

  if (bot?.saved) {
    return {
      label: "Inativo",
      tone: "alerta",
      description: "O token esta salvo no banco, mas o bot esta parado.",
    };
  }

  return {
    label: "Nao configurado",
    tone: "alerta",
    description: "Salve o token do bot para liberar as demais acoes.",
  };
}

export function formatTelegramBotName(bot) {
  if (bot?.username) return `@${bot.username}`;
  if (bot?.name) return bot.name;
  if (bot?.saved) return "Salvo no banco";
  return "Nao configurado";
}

export async function fetchTelegramBot(moduleKey = TELEGRAM_MODULE) {
  const data = await api.get(
    `/melpethostel/telegram/bot?module=${encodeURIComponent(moduleKey)}`,
  );
  return {
    ...createEmptyBot(moduleKey),
    ...(data || {}),
    module: data?.module || moduleKey,
  };
}

export async function saveTelegramBotConfig({
  moduleKey = TELEGRAM_MODULE,
  botToken,
  defaultTimezone,
  pollingEnabled,
}) {
  const data = await api.post("/melpethostel/telegram/bot", {
    module: moduleKey,
    botToken: botToken || undefined,
    defaultTimezone: defaultTimezone || TELEGRAM_TIMEZONE,
    pollingEnabled,
  });

  return {
    ...createEmptyBot(moduleKey),
    ...(data || {}),
    module: data?.module || moduleKey,
  };
}

export async function setTelegramBotActive({
  moduleKey = TELEGRAM_MODULE,
  active,
}) {
  const data = await api.post("/melpethostel/telegram/bot/status", {
    module: moduleKey,
    active,
  });
  const bot = data?.bot || data;

  return {
    ...createEmptyBot(moduleKey),
    ...(bot || {}),
    module: bot?.module || moduleKey,
  };
}

export async function sendTelegramTest({
  moduleKey = TELEGRAM_MODULE,
  message = TELEGRAM_DEFAULT_TEST_MESSAGE,
} = {}) {
  return api.post("/melpethostel/telegram/test", {
    module: moduleKey,
    message,
  });
}
