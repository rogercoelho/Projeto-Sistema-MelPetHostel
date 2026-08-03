require("dotenv").config({ quiet: true });
const express = require("express");
const cors = require("cors");
const routes = require("./src/routes");
const authRoutes = require("./src/routes/auth");
const dbPool = require("./src/config/database");
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;
const path = require("path");
const {
  createRequestLogger,
  logError,
} = require("./src/utils/apiLogger");

if (!JWT_SECRET) {
  console.error(
    "Missing required environment variable JWT_SECRET. Set JWT_SECRET and restart the server.",
  );
  process.exit(1);
}

const app = express();

app.use(createRequestLogger());

// CORS: allow local dev frontends plus the published domains.
const defaultOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://melpethostel.com.br",
  "https://www.melpethostel.com.br",
];
const configuredOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...defaultOrigins, ...configuredOrigins])];

function markDbUnavailable(err) {
  err.status = err.statusCode = 503;
  err.publicMessage =
    "Banco de dados indisponivel. Verifique DB_HOST, DB_PORT e Remote MySQL no cPanel.";
  return err;
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);

      console.log("CORS bloqueado:", origin);
      const err = new Error("Not allowed by CORS");
      err.status = err.statusCode = 403;
      err.publicMessage = `Origem nao permitida pelo CORS: ${origin}`;
      callback(err);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "x-user",
      "pasta-conta",
    ],
  }),
);

// Ensure preflight requests are handled
//app.options("/*", cors());
app.use(express.json());

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    res.charset = "utf-8";
    return originalJson(body);
  };
  next();
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    api: "sistema-melpethostel-api",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health/db", async (req, res, next) => {
  let conn;
  try {
    conn = await dbPool.getConnection();
    const [rows] = await conn.query("SELECT 1 AS ok, DATABASE() AS db");
    res.json({
      status: "ok",
      database: rows && rows[0] ? rows[0].db : null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(markDbUnavailable(err));
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch {
        // ignore
      }
    }
  }
});

// Serve uploaded files from the uploads folder (same default used by routes)
const uploadsDir =
  process.env.UPLOADS_ROOT || path.resolve(__dirname, "uploads");
app.use("/melpethostel/uploads", express.static(uploadsDir));

// DB connection per-request middleware.
// Acquires a connection from the pool, sets @log_usuario session variable
// (used by DB triggers) and attaches the connection to `req.db`.
app.use(async (req, res, next) => {
  let conn;
  try {
    conn = await dbPool.getConnection();
    req.db = conn;

    // Determine username from Bearer token or fallback header
    let user = "system";
    let decodedToken = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.replace("Bearer ", "");
        decodedToken = jwt.verify(token, JWT_SECRET);
        if (decodedToken) {
          if (decodedToken.login) user = decodedToken.login;
          else if (decodedToken.username) user = decodedToken.username;
          else if (decodedToken.email) user = decodedToken.email;
          else if (decodedToken.sub) user = `sub:${decodedToken.sub}`;
          else if (decodedToken.id) user = `user:${decodedToken.id}`;
        }
      } catch {
        // ignore invalid token; keep user as 'system' or x-user
      }
    } else if (req.headers["x-user"]) {
      user = req.headers["x-user"];
    }

    // Attach a simplified user object to the request for downstream logic.
    // Prefer data from the decoded JWT when available; fall back to x-user header.
    if (decodedToken) {
      // Keep decoded payload shape (may include id, login, grupo, modules)
      req.user = decodedToken;
    } else if (req.headers["x-user"]) {
      req.user = { login: req.headers["x-user"] };
    } else {
      req.user = { login: user };
    }

    // set session variable for triggers to read
    await conn.query("SET @log_usuario = ?", [user]);

    let released = false;
    const releaseConnection = () => {
      if (released) return;
      released = true;
      try {
        conn.release();
      } catch {
        // ignore
      }
    };

    res.on("finish", releaseConnection);
    res.on("close", releaseConnection);
    res.on("error", releaseConnection);

    next();
  } catch (err) {
    if (conn)
      try {
        conn.release();
      } catch {}
    next(markDbUnavailable(err));
  }
});

// Mount the MelPetHostel module explicitly.
app.use("/melpethostel", require("./src/routes/melpethostel"));
app.use("/auth", authRoutes);
// Keep a small root router for health checks and API info
app.use("/", routes);

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  const status = err.status || err.statusCode || 500;
  const isPetsEndpoint =
    req.method === "POST" && req.path === "/melpethostel/pets";
  const payload = {
    status: "erro",
    mensagem:
      err.publicMessage ||
      (isPetsEndpoint && (err.sqlMessage || err.message)) ||
      (status >= 500 ? "Erro interno do servidor." : err.message),
  };

  if (process.env.NODE_ENV !== "production" && err.code) {
    payload.codigo = err.code;
  }

  logError("api_error", err, {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl || req.url,
    status,
  });
  console.error("API error:", err);
  res.status(status).json(payload);
});

module.exports = app;
