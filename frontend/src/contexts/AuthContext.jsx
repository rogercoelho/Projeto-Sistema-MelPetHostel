import {
  createContext,
  useContext,
  useState,
  useEffect,
  useSyncExternalStore,
} from "react";
import api from "../services/api.js";

const AuthContext = createContext(null);

const sessionStore = {
  snapshot: {
    tempoRestante: null,
    showSessionWarning: false,
  },
  listeners: new Set(),
  timerId: null,
  expiryMs: null,
  warningTriggered: false,
};

let sessionExpiredHandler = null;

function emitSessionStore() {
  for (const listener of sessionStore.listeners) {
    listener();
  }
}

function setSessionSnapshot(partial) {
  sessionStore.snapshot = { ...sessionStore.snapshot, ...partial };
  emitSessionStore();
}

function subscribeSessionStore(listener) {
  sessionStore.listeners.add(listener);
  return () => {
    sessionStore.listeners.delete(listener);
  };
}

function getSessionSnapshot() {
  return sessionStore.snapshot;
}

function stopSessionTimer() {
  if (sessionStore.timerId) {
    clearInterval(sessionStore.timerId);
    sessionStore.timerId = null;
  }
  sessionStore.expiryMs = null;
}

function clearSessionState() {
  stopSessionTimer();
  sessionStore.warningTriggered = false;
  setSessionSnapshot({
    tempoRestante: null,
    showSessionWarning: false,
  });
}

function handleSessionTick() {
  if (!sessionStore.expiryMs) {
    return;
  }

  const remaining = Math.max(
    0,
    Math.floor((sessionStore.expiryMs - Date.now()) / 1000),
  );

  if (remaining <= 0) {
    clearSessionState();
    if (sessionExpiredHandler) {
      sessionExpiredHandler();
    }
    return;
  }

  if (remaining <= 180 && !sessionStore.warningTriggered) {
    sessionStore.warningTriggered = true;
    setSessionSnapshot({
      tempoRestante: remaining,
      showSessionWarning: true,
    });
    return;
  }

  setSessionSnapshot({ tempoRestante: remaining });
}

function startSessionTimer(expiryMs) {
  stopSessionTimer();
  sessionStore.expiryMs = expiryMs;
  sessionStore.warningTriggered = false;
  setSessionSnapshot({
    tempoRestante: Math.max(0, Math.floor((expiryMs - Date.now()) / 1000)),
    showSessionWarning: false,
  });
  sessionStore.timerId = setInterval(handleSessionTick, 1000);
}

function closeSessionWarning() {
  setSessionSnapshot({ showSessionWarning: false });
}

// Decode the payload of a JWT without verifying the signature.
// Used only to read the `exp` claim client-side.
function decodeJwtPayload(token) {
  try {
    const part = token.split(".")[1];
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    sessionExpiredHandler = () => {
      localStorage.removeItem("token");
      localStorage.removeItem("usuario");
      api.setToken(null);
      setUsuario(null);
    };

    return () => {
      sessionExpiredHandler = null;
    };
  }, []);

  // Mount: restore session only if token is not yet expired
  useEffect(() => {
    const token = localStorage.getItem("token");
    const usuarioSalvo = localStorage.getItem("usuario");

    if (token && usuarioSalvo) {
      const decoded = decodeJwtPayload(token);
      if (decoded && decoded.exp && decoded.exp * 1000 > Date.now()) {
        setUsuario(JSON.parse(usuarioSalvo));
        api.setToken(token);
        startSessionTimer(decoded.exp * 1000);
      } else {
        // Token already expired — clear storage silently
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");
        clearSessionState();
      }
    }
    setCarregando(false);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => () => stopSessionTimer(), []);

  const login = async (loginUsuario, senha) => {
    try {
      const data = await api.post("/auth/login", {
        login: loginUsuario,
        senha,
      });

      if (data && data.status === "sucesso") {
        localStorage.setItem("token", data.token);
        localStorage.setItem("usuario", JSON.stringify(data.usuario));
        api.setToken(data.token);
        setUsuario(data.usuario);
        const decoded = decodeJwtPayload(data.token);
        if (decoded && decoded.exp) {
          startSessionTimer(decoded.exp * 1000);
        }
        return { sucesso: true };
      }

      return {
        sucesso: false,
        mensagem: (data && data.mensagem) || "Login inválido",
      };
    } catch (err) {
      const msg =
        err && err.message ? err.message : "Erro ao conectar com o servidor";
      return { sucesso: false, mensagem: msg };
    }
  };

  const accessAsUser = async (userId) => {
    const origin = {
      token: localStorage.getItem("token"),
      usuario: localStorage.getItem("usuario"),
    };
    if (!origin.token || !origin.usuario) {
      return { sucesso: false, mensagem: "Sessão administrativa não encontrada." };
    }
    try {
      const data = await api.post(`/auth/impersonar/${userId}`, {});
      if (!data?.token || !data?.usuario) {
        return { sucesso: false, mensagem: data?.mensagem || "Não foi possível acessar o usuário." };
      }
      sessionStorage.setItem("melpet:admin-session", JSON.stringify(origin));
      localStorage.setItem("melpet:admin-session", JSON.stringify(origin));
      localStorage.setItem("token", data.token);
      localStorage.setItem("usuario", JSON.stringify(data.usuario));
      api.setToken(data.token);
      setUsuario(data.usuario);
      const decoded = decodeJwtPayload(data.token);
      if (decoded?.exp) startSessionTimer(decoded.exp * 1000);
      return { sucesso: true };
    } catch (error) {
      return { sucesso: false, mensagem: error?.message || "Não foi possível acessar o usuário." };
    }
  };

  const returnToAdmin = () => {
    try {
      const origin = JSON.parse(
        sessionStorage.getItem("melpet:admin-session") ||
        localStorage.getItem("melpet:admin-session") ||
        "null",
      );
      if (!origin?.token || !origin?.usuario) return false;
      localStorage.setItem("token", origin.token);
      localStorage.setItem("usuario", origin.usuario);
      api.setToken(origin.token);
      setUsuario(JSON.parse(origin.usuario));
      const decoded = decodeJwtPayload(origin.token);
      if (decoded?.exp) startSessionTimer(decoded.exp * 1000);
      sessionStorage.removeItem("melpet:admin-session");
      localStorage.removeItem("melpet:admin-session");
      return true;
    } catch {
      return false;
    }
  };
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    api.setToken(null);
    setUsuario(null);
    clearSessionState();
  };

  return (
    <AuthContext.Provider value={{ usuario, login, logout, carregando, accessAsUser, returnToAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider");
  }
  return context;
}

export function useSession() {
  const snapshot = useSyncExternalStore(
    subscribeSessionStore,
    getSessionSnapshot,
    getSessionSnapshot,
  );

  const renovarSessao = async () => {
    try {
      const data = await api.post("/auth/renovar", {});
      if (data && data.status === "sucesso" && data.token) {
        localStorage.setItem("token", data.token);
        api.setToken(data.token);
        const decoded = decodeJwtPayload(data.token);
        if (decoded && decoded.exp) {
          startSessionTimer(decoded.exp * 1000);
        }
      }
    } catch (err) {
      console.error("Erro ao renovar sessão:", err);
      throw err;
    }
  };

  return {
    ...snapshot,
    renovarSessao,
    fecharAlertaSessao: closeSessionWarning,
  };
}
