const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_RETENTION_DAYS = 30;
const MAX_TEXT_LENGTH = 20000;
const MAX_ARRAY_ITEMS = 50;
const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|senha|password|passwd|secret|token|jwt|api[_-]?key|bot[_-]?token/i;

const logDir =
  process.env.API_LOG_DIR || path.resolve(__dirname, "../../logs");
const retentionDays = Number(process.env.API_LOG_RETENTION_DAYS) || DEFAULT_RETENTION_DAYS;

let cleanupLastRun = 0;
let consoleLoggerInstalled = false;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ensureLogDir() {
  fs.mkdirSync(logDir, { recursive: true });
}

function cleanupOldLogs() {
  const now = Date.now();
  if (now - cleanupLastRun < 60 * 60 * 1000) return;
  cleanupLastRun = now;

  try {
    ensureLogDir();
    const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
    for (const fileName of fs.readdirSync(logDir)) {
      const match = /^(api|errors|system)-(\d{4}-\d{2}-\d{2})\.log$/.exec(
        fileName,
      );
      if (!match) continue;

      const fileDate = new Date(`${match[2]}T00:00:00.000Z`).getTime();
      if (Number.isFinite(fileDate) && fileDate < cutoff) {
        fs.unlinkSync(path.join(logDir, fileName));
      }
    }
  } catch {
    // Logging must never break the API.
  }
}

function truncateText(value) {
  const text = String(value);
  if (text.length <= MAX_TEXT_LENGTH) return text;
  return `${text.slice(0, MAX_TEXT_LENGTH)}...[truncated ${text.length - MAX_TEXT_LENGTH} chars]`;
}

function sanitize(value, depth = 0, key = "") {
  if (SENSITIVE_KEY_PATTERN.test(key)) return "[REDACTED]";
  if (value === null || value === undefined) return value;
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: value.code,
      stack: value.stack,
    };
  }
  if (typeof value === "string") return truncateText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (depth >= 6) return "[MaxDepth]";

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitize(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`[truncated ${value.length - MAX_ARRAY_ITEMS} items]`);
    }
    return items;
  }

  const output = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    output[childKey] = sanitize(childValue, depth + 1, childKey);
  }
  return output;
}

function writeLog(stream, entry) {
  try {
    cleanupOldLogs();
    ensureLogDir();
    const filePath = path.join(logDir, `${stream}-${today()}.log`);
    const payload = {
      timestamp: new Date().toISOString(),
      ...sanitize(entry),
    };
    fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
  } catch {
    // Logging must never break the API.
  }
}

function logEvent(type, details = {}, stream = "system") {
  writeLog(stream, { type, ...details });
}

function logError(type, error, details = {}) {
  writeLog("errors", {
    type,
    ...details,
    error: sanitize(error),
  });
}

function formatConsoleArg(arg) {
  if (arg instanceof Error) return arg.stack || arg.message;
  if (typeof arg === "string") return arg;

  try {
    return JSON.stringify(sanitize(arg));
  } catch {
    return String(arg);
  }
}

function installConsoleLogger() {
  if (consoleLoggerInstalled) return;
  consoleLoggerInstalled = true;

  for (const level of ["log", "info", "warn", "error"]) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      writeLog(level === "warn" || level === "error" ? "errors" : "system", {
        type: "console",
        level,
        message: args.map(formatConsoleArg).join(" "),
        args,
      });
      original(...args);
    };
  }
}

function createRequestLogger() {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    const requestId = crypto.randomUUID
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString("hex");
    let responseCaptured = false;
    let responseBody;

    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (!responseCaptured) {
        responseCaptured = true;
        responseBody = body;
      }
      return originalJson(body);
    };

    const originalSend = res.send.bind(res);
    res.send = (body) => {
      if (!responseCaptured) {
        responseCaptured = true;
        responseBody = body;
      }
      return originalSend(body);
    };

    function writeRequestLog(event) {
      const finishedAt = process.hrtime.bigint();
      const durationMs = Number(finishedAt - startedAt) / 1_000_000;
      const entry = {
        type: "request",
        event,
        requestId,
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        ip: req.ip,
        user: req.user || null,
        request: {
          headers: req.headers,
          query: req.query,
          params: req.params,
          body: req.body,
          files: req.files || req.file || null,
        },
        response: {
          headers: res.getHeaders(),
          body: responseBody,
        },
      };

      writeLog("api", entry);
      if (res.statusCode >= 400) writeLog("errors", entry);
    }

    res.on("finish", () => writeRequestLog("finish"));
    res.on("close", () => {
      if (!res.writableEnded) writeRequestLog("closed");
    });

    next();
  };
}

module.exports = {
  createRequestLogger,
  installConsoleLogger,
  logEvent,
  logError,
  logDir,
};
