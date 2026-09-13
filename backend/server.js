require("dotenv").config({ quiet: true });

const {
  installConsoleLogger,
  logError,
  logEvent,
} = require("./src/utils/apiLogger");

installConsoleLogger();

const app = require("./app");
const dbPool = require("./src/config/database");
const {
  startBackgroundServices,
  stopBackgroundServices,
} = require("./src/services/backgroundServices");
const { startPaymentReminderService, stopPaymentReminderService } = require("./src/services/paymentReminderService");

function shouldStartBackgroundServices() {
  return process.env.START_BACKGROUND_SERVICES === "true";
}

async function startAppBackgroundServices() {
  startPaymentReminderService();
  if (!shouldStartBackgroundServices()) {
    console.log("Background services disabled for API process");
    return;
  }

  try {
    await startBackgroundServices({ source: "api", polling: false });
  } catch (error) {
    logError("background_start_failed", error);
    console.error("Failed to start background services:", error.message || error);
  }
}

function installShutdownHandlers(server) {
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`Received ${signal}. Stopping API server...`);
    logEvent("shutdown_started", { signal });
    const forceExitTimer = setTimeout(() => process.exit(1), 10000);
    forceExitTimer.unref?.();

    try {
      stopPaymentReminderService();
      await stopBackgroundServices();
      server.close(async () => {
        try {
          await dbPool.end();
        } catch (error) {
          logError("database_pool_close_failed", error);
          console.error("Failed to close database pool:", error.message || error);
        }

        clearTimeout(forceExitTimer);
        logEvent("shutdown_finished", { signal });
        process.exit(0);
      });
    } catch (error) {
      logError("shutdown_failed", error, { signal });
      console.error("Failed to stop API cleanly:", error.message || error);
      process.exit(1);
    }
  }

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

process.on("uncaughtException", (error) => {
  logError("uncaught_exception", error);
  console.error("[startup] uncaughtException:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logError("unhandled_rejection", reason);
  console.error("[startup] unhandledRejection:", reason);
});

const port = process.env.PORT || process.env.APP_PORT || 3001;
const server = app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
  logEvent("server_started", {
    port: String(port),
    node: process.version,
    cwd: process.cwd(),
  });
  startAppBackgroundServices();
});

server.on("error", (error) => {
  logError("server_listen_error", error, { port: String(port) });
  console.error("[startup] server listen error:", error);
  process.exit(1);
});

installShutdownHandlers(server);
