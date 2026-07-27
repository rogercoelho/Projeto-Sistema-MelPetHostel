require("dotenv").config();

const fs = require("fs");
const path = require("path");
const {
  startBackgroundServices,
  stopBackgroundServices,
} = require("./src/services/backgroundServices");

function mirrorStderrToFile() {
  const stderrLogPath = path.resolve(__dirname, "stderr.log");
  const stderrLogStream = fs.createWriteStream(stderrLogPath, { flags: "a" });
  const originalWrite = process.stderr.write.bind(process.stderr);

  process.stderr.write = (chunk, encoding, callback) => {
    try {
      stderrLogStream.write(chunk);
    } catch (error) {
      originalWrite(
        `[telegram bot worker stderr mirror failed] ${error.message || error}\n`,
      );
    }

    return originalWrite(chunk, encoding, callback);
  };

  return () => {
    try {
      stderrLogStream.end();
    } catch {
      // ignore
    }
  };
}

function installShutdownHandlers(closeLogs) {
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`Received ${signal}. Stopping Telegram bot worker...`);
    const forceExitTimer = setTimeout(() => process.exit(1), 10000);
    forceExitTimer.unref?.();

    try {
      await stopBackgroundServices();
      closeLogs();
      clearTimeout(forceExitTimer);
      process.exit(0);
    } catch (error) {
      console.error(
        "Failed to stop Telegram bot worker cleanly:",
        error.message || error,
      );
      closeLogs();
      process.exit(1);
    }
  }

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

async function main() {
  const closeLogs = mirrorStderrToFile();
  installShutdownHandlers(closeLogs);

  console.log("Starting Telegram bot worker...");
  await startBackgroundServices({ source: "telegram-bot-worker" });
  console.log("Telegram bot worker started");
}

main().catch((error) => {
  console.error("Failed to start Telegram bot worker:", error.message || error);
  process.exit(1);
});
