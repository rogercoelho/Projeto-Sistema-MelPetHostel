const ENV = import.meta.env || {};
const USE_PROXY = ENV.VITE_USE_PROXY === "true";
const API_URL = USE_PROXY
  ? "/api"
  : ENV.VITE_API_URL || "https://api.melpethostel.com.br";

let authToken = null;
let refreshToken = null;

// pendingRequests will store { controller, promise } so concurrent callers can reuse
const pendingRequests = new Map();
const cache = new Map();

const DEFAULT_TIMEOUT = 15000;
const RETRY_LIMIT = 2;
const DEBUG = true;

// =========================
// helpers
// =========================
function log(...args) {
  if (DEBUG) console.log("[API]", ...args);
}

function buildUrl(endpoint) {
  const base = String(API_URL).replace(/\/+$/, "");
  return `${base}/${String(endpoint).replace(/^\/+/, "")}`;
}

function buildRequestKey(url, options) {
  const method = options.method || "GET";
  const body = typeof options.body === "string" ? options.body : "";
  return `${method} ${url} ${body}`;
}

function previewText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function getUserHeader() {
  try {
    const saved = localStorage.getItem("usuario");
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return (
      parsed.login ||
      parsed.id ||
      parsed.Usuario_Login ||
      parsed.Usuario_ID ||
      null
    );
  } catch {
    return null;
  }
}

function timeoutPromise(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Timeout da requisição")), ms),
  );
}

// =========================
// core request
// =========================
async function request(endpoint, options = {}, retry = 0) {
  const url = buildUrl(endpoint);
  const requestKey = buildRequestKey(url, options);

  // If there's already an in-flight identical request, reuse its promise.
  if (retry === 0 && pendingRequests.has(requestKey)) {
    log("Reusing pending request:", url);
    try {
      return await pendingRequests.get(requestKey).promise;
    } catch (err) {
      // If the existing request failed, continue and perform a fresh one
      log("Existing pending request failed, will retry:", err.message);
    }
  }

  const controller = new AbortController();

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const userHeader = getUserHeader();
  if (userHeader) headers["x-user"] = userHeader;

  const config = {
    ...options,
    headers,
    signal: controller.signal,
  };

  log("→", options.method || "GET", url);

  // Create the request promise and store it so concurrent callers can reuse it.
  const reqPromise = (async () => {
    try {
      const response = await Promise.race([
        fetch(url, config),
        timeoutPromise(DEFAULT_TIMEOUT),
      ]);

      const text = await response.text();

      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        const contentType = response.headers.get("content-type") || "sem tipo";
        const preview = previewText(text);
        throw new Error(
          `Resposta invalida do servidor (${response.status}, ${contentType})${
            preview ? `: ${preview}` : ""
          }`,
        );
      }

      if (response.status === 401 && refreshToken) {
        log("Token expirado — tentando refresh");
        await refreshAuthToken();
        return request(endpoint, options);
      }

      if (!response.ok) {
        throw new Error(data?.mensagem || `Erro ${response.status}`);
      }

      log("✓ resposta:", data);

      return data;
    } catch (err) {
      log("✗ erro:", err.message);

      if (
        retry < RETRY_LIMIT &&
        (err.message.includes("fetch") || err.message.includes("Timeout"))
      ) {
        log("↻ retry", retry + 1);
        return request(endpoint, options, retry + 1);
      }

      throw err;
    } finally {
      pendingRequests.delete(requestKey);
    }
  })();

  pendingRequests.set(requestKey, { controller, promise: reqPromise });

  return await reqPromise;
}

// =========================
// refresh token automático
// =========================
async function refreshAuthToken() {
  const res = await fetch(buildUrl("/auth/refresh"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${refreshToken}`,
    },
  });

  const data = await res.json();

  authToken = data.token;
  refreshToken = data.refreshToken;
}

// =========================
// cache GET simples
// =========================
async function getWithCache(endpoint, ttl = 5000) {
  const cached = cache.get(endpoint);
  if (cached && Date.now() - cached.time < ttl) {
    log("cache hit:", endpoint);
    return cached.data;
  }

  const data = await request(endpoint);
  cache.set(endpoint, { data, time: Date.now() });
  return data;
}

// =========================
// export API
// =========================
export const api = {
  get: (endpoint, useCache = false) =>
    useCache ? getWithCache(endpoint) : request(endpoint),

  post: (endpoint, data) =>
    request(endpoint, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  put: (endpoint, data) =>
    request(endpoint, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  patch: (endpoint, data) =>
    request(endpoint, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: (endpoint) =>
    request(endpoint, {
      method: "DELETE",
    }),

  setToken: (token) => {
    authToken = token;
  },

  setRefreshToken: (token) => {
    refreshToken = token;
  },
};

export default api;

// export API base so other modules can build absolute URLs when needed
export { API_URL };
