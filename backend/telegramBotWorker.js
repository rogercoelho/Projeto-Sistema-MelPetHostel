require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const {
  startBackgroundServices,
  stopBackgroundServices,
} = require("./src/services/backgroundServices");

const logsDir = path.resolve(__dirname, "logs");
const workerLockFile =
  process.env.TELEGRAM_WORKER_LOCK_FILE ||
  path.join(logsDir, "telegram-worker.lock");

function isProcessAlive(pid) {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}

function readLockPid() {
  try {
    const metadata = JSON.parse(fs.readFileSync(workerLockFile, "utf8"));
    return Number(metadata.pid);
  } catch {
    return null;
  }
}

function acquireWorkerLock() {
  fs.mkdirSync(path.dirname(workerLockFile), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(workerLockFile, "wx");
      fs.writeFileSync(
        fd,
        JSON.stringify(
          {
            pid: process.pid,
            startedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
      fs.closeSync(fd);
      return true;
    } catch (error) {
      if (!error || error.code !== "EEXIST") throw error;

      const lockPid = readLockPid();
      if (isProcessAlive(lockPid)) {
        console.log(
          `Telegram bot worker already running with pid ${lockPid}. Exiting.`,
        );
        return false;
      }

      try {
        fs.unlinkSync(workerLockFile);
      } catch (unlinkError) {
        if (!unlinkError || unlinkError.code !== "ENOENT") throw unlinkError;
      }
    }
  }

  console.log("Telegram bot worker lock could not be acquired. Exiting.");
  return false;
}

function releaseWorkerLock() {
  try {
    if (readLockPid() === process.pid) {
      fs.unlinkSync(workerLockFile);
    }
  } catch {
    // ignore lock cleanup errors
  }
}

function mirrorStderrToFile() {
  fs.mkdirSync(logsDir, { recursive: true });
  const stderrLogPath = path.join(logsDir, "telegram-worker-stderr.log");
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
      releaseWorkerLock();
      closeLogs();
      clearTimeout(forceExitTimer);
      process.exit(0);
    } catch (error) {
      console.error(
        "Failed to stop Telegram bot worker cleanly:",
        error.message || error,
      );
      releaseWorkerLock();
      closeLogs();
      process.exit(1);
    }
  }

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

async function main() {
  if (!acquireWorkerLock()) return;

  const closeLogs = mirrorStderrToFile();
  installShutdownHandlers(closeLogs);

  console.log("Starting Telegram bot worker...");
  await startBackgroundServices({ source: "telegram-bot-worker", polling: true });
  console.log("Telegram bot worker started");
}

main().catch((error) => {
  console.error("Failed to start Telegram bot worker:", error.message || error);
  releaseWorkerLock();
  process.exit(1);
});

process.on("exit", releaseWorkerLock);
