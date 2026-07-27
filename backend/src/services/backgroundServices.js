const {
  startTelegramService,
  stopTelegramService,
} = require("./telegramService");

let started = false;

async function startBackgroundServices({ source = "telegram-bot-worker" } = {}) {
  if (started) {
    return false;
  }

  started = true;
  console.log(`[background] starting services from ${source}`);

  await startTelegramService({ polling: true });

  console.log("[background] services started");
  return true;
}

async function stopBackgroundServices() {
  if (!started) {
    return false;
  }

  started = false;
  console.log("[background] stopping services");

  await stopTelegramService();

  console.log("[background] services stopped");
  return true;
}

function isBackgroundServicesStarted() {
  return started;
}

module.exports = {
  startBackgroundServices,
  stopBackgroundServices,
  isBackgroundServicesStarted,
};
