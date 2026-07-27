import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../components/Toast/ToastContext";
import { api } from "../../services/api";
import TelegramBotConfig from "./TelegramBotConfig";
import "./styles.css";

const DEFAULT_MODULE = "melpethostel";

const EXCLUDED_MODULES = new Set([
  "telegram_bot_config",
  "telegram_bot_module",
  "telegrambots",
  "configurar_bot_telegram",
]);

function normalizeModule(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function moduleLabel(moduleKey) {
  const value = normalizeModule(moduleKey);
  if (!value) return "Módulo";
  if (value === "melpethostel") return "Mel Pet Hostel";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function maskChatId(chatId) {
  const value = String(chatId || "");
  if (!value) return "";
  if (value.length <= 6) return value;
  return `${value.slice(0, 3)}...${value.slice(-3)}`;
}

export default function Gerenciamento({ onBack }) {
  const { usuario } = useAuth();
  const { showToast } = useToast();
  const currentLogin = String(
    usuario?.login || usuario?.Usuario_Login || "",
  ).trim();

  const modules = useMemo(() => {
    const fromUser = Array.isArray(usuario?.modules) ? usuario.modules : [];
    const fallback = [DEFAULT_MODULE];
    const source = fromUser.length ? fromUser : fallback;

    const normalized = source
      .map((module) => normalizeModule(module))
      .filter((module) => module && !EXCLUDED_MODULES.has(module));

    return Array.from(new Set(normalized));
  }, [usuario?.modules]);

  const [selectedModule, setSelectedModule] = useState(
    modules[0] || DEFAULT_MODULE,
  );
  const [admins, setAdmins] = useState([]);
  const [loadingModuleData, setLoadingModuleData] = useState(false);
  const [selectedAccessAdmins, setSelectedAccessAdmins] = useState([]);
  const [accessEnabled, setAccessEnabled] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [currentAdminStatus, setCurrentAdminStatus] = useState(null);
  const [linkingSelf, setLinkingSelf] = useState(false);
  const [unlinkingSelf, setUnlinkingSelf] = useState(false);
  const linkPollRef = useRef(null);

  const safeSelectedModule = modules.includes(selectedModule)
    ? selectedModule
    : modules[0] || DEFAULT_MODULE;

  const linkedAdmins = useMemo(
    () => admins.filter((admin) => admin.linked),
    [admins],
  );

  useEffect(() => {
    if (!modules.length) return;
    if (!modules.includes(selectedModule)) {
      setSelectedModule(modules[0]);
    }
  }, [modules, selectedModule]);

  useEffect(() => {
    return () => {
      if (linkPollRef.current) {
        window.clearInterval(linkPollRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadModuleData() {
      const moduleKey = safeSelectedModule;
      if (!moduleKey) return;

      setLoadingModuleData(true);
      try {
        const data = await api.get(
          `/melpethostel/telegram/access-notification?module=${encodeURIComponent(moduleKey)}`,
        );

        if (!mounted) return;

        const nextAdmins = Array.isArray(data?.admins) ? data.admins : [];
        const nextConfig = data?.config || {};
        setAdmins(nextAdmins);
        setAccessEnabled(Boolean(nextConfig.enabled));
        setSelectedAccessAdmins(
          Array.isArray(nextConfig.adminLogins)
            ? nextConfig.adminLogins
            : nextConfig.adminLogin
              ? [nextConfig.adminLogin]
              : nextAdmins.filter((a) => a.linked).map((a) => a.login) || [],
        );

        if (currentLogin) {
          try {
            const status = await api.get(
              `/melpethostel/telegram/status?module=${encodeURIComponent(moduleKey)}&targetLogin=${encodeURIComponent(currentLogin)}`,
            );
            if (mounted) setCurrentAdminStatus(status || null);
          } catch (statusErr) {
            if (mounted) setCurrentAdminStatus(null);
            console.debug(
              "Could not load current admin telegram status:",
              statusErr?.message || statusErr,
            );
          }
        } else if (mounted) {
          setCurrentAdminStatus(null);
        }
      } catch (err) {
        if (mounted) {
          setAdmins([]);
          setAccessEnabled(false);
          setSelectedAccessAdmins([]);
          setCurrentAdminStatus(null);
          showToast(err.message || "Erro ao carregar configuração.", "error");
        }
      } finally {
        if (mounted) setLoadingModuleData(false);
      }
    }

    loadModuleData();
    return () => {
      mounted = false;
    };
  }, [safeSelectedModule, showToast, currentLogin]);

  async function refreshModuleData() {
    const data = await api.get(
      `/melpethostel/telegram/access-notification?module=${encodeURIComponent(safeSelectedModule)}`,
    );
    const nextAdmins = Array.isArray(data?.admins) ? data.admins : [];
    const nextConfig = data?.config || {};
    setAdmins(nextAdmins);
    setAccessEnabled(Boolean(nextConfig.enabled));
    setSelectedAccessAdmins(
      Array.isArray(nextConfig.adminLogins)
        ? nextConfig.adminLogins
        : nextConfig.adminLogin
          ? [nextConfig.adminLogin]
          : nextAdmins.filter((a) => a.linked).map((a) => a.login) || [],
    );

    if (currentLogin) {
      const status = await api.get(
        `/melpethostel/telegram/status?module=${encodeURIComponent(safeSelectedModule)}&targetLogin=${encodeURIComponent(currentLogin)}`,
      );
      setCurrentAdminStatus(status || null);
    }
  }

  function stopLinkPolling() {
    if (!linkPollRef.current) return;
    window.clearInterval(linkPollRef.current);
    linkPollRef.current = null;
  }

  function startLinkPolling(targetLogin) {
    stopLinkPolling();
    let attempts = 0;

    linkPollRef.current = window.setInterval(async () => {
      attempts += 1;
      try {
        const next = await api.get(
          `/melpethostel/telegram/status?module=${encodeURIComponent(safeSelectedModule)}&targetLogin=${encodeURIComponent(targetLogin)}`,
        );
        if (next?.linked) {
          stopLinkPolling();
          showToast(`Telegram vinculado para ${targetLogin}.`, "success");
          await refreshModuleData();
        }
      } catch (err) {
        console.debug("Could not poll admin link:", err?.message || err);
      }

      if (attempts >= 24) {
        stopLinkPolling();
      }
    }, 5000);
  }

  async function handleGenerateLink(adminLogin) {
    const targetLogin = String(adminLogin || "").trim();
    if (!targetLogin) return;

    setLinkingSelf(targetLogin === currentLogin);
    try {
      const res = await api.post("/melpethostel/telegram/link", {
        module: safeSelectedModule,
        targetLogin,
      });

      if (!res?.link && !res?.tgLink) {
        throw new Error("Resposta inválida do servidor.");
      }

      window.open(res.tgLink || res.link, "_blank", "noopener,noreferrer");
      showToast(
        `Abra o Telegram para concluir o vínculo de ${targetLogin}.`,
        "info",
      );
      startLinkPolling(targetLogin);
      await refreshModuleData();
    } catch (err) {
      showToast(err.message || "Erro ao gerar o vínculo.", "error");
    } finally {
      setLinkingSelf(false);
    }
  }

  async function handleUnlinkAdmin(adminLogin) {
    const targetLogin = String(adminLogin || "").trim();
    if (!targetLogin) return;

    if (
      !window.confirm(
        `Desvincular o Telegram de ${targetLogin} em ${moduleLabel(
          safeSelectedModule,
        )}?`,
      )
    ) {
      return;
    }

    setUnlinkingSelf(targetLogin === currentLogin);
    try {
      await api.delete(
        `/melpethostel/telegram/link?module=${encodeURIComponent(safeSelectedModule)}&targetLogin=${encodeURIComponent(targetLogin)}`,
      );
      setSelectedAccessAdmins((prev) => prev.filter((l) => l !== targetLogin));
      showToast("Telegram desvinculado.", "success");
      await refreshModuleData();
    } catch (err) {
      showToast(err.message || "Erro ao desvincular Telegram.", "error");
    } finally {
      setUnlinkingSelf(false);
    }
  }

  async function handleTestCurrentAdmin() {
    try {
      await api.post(
        `/melpethostel/telegram/test?module=${encodeURIComponent(safeSelectedModule)}`,
        {},
      );
      showToast("Mensagem de teste enviada.", "success");
    } catch (err) {
      showToast(err.message || "Erro ao enviar teste.", "error");
    }
  }

  async function handleSaveAccessNotification(e) {
    e?.preventDefault?.();

    if (
      accessEnabled &&
      (!selectedAccessAdmins || !selectedAccessAdmins.length)
    ) {
      showToast(
        "Selecione pelo menos um administrador com Telegram vinculado.",
        "error",
      );
      return;
    }

    setSavingAccess(true);
    try {
      const res = await api.post("/melpethostel/telegram/access-notification", {
        module: safeSelectedModule,
        adminLogins: accessEnabled ? selectedAccessAdmins : [],
        enabled: accessEnabled,
      });

      const nextConfig = res?.config || {};
      setAccessEnabled(Boolean(nextConfig.enabled));
      setSelectedAccessAdmins(
        Array.isArray(nextConfig.adminLogins)
          ? nextConfig.adminLogins
          : nextConfig.adminLogin
            ? [nextConfig.adminLogin]
            : [],
      );
      showToast("Notificação de acesso salva.", "success");
      await refreshModuleData();
    } catch (err) {
      showToast(err.message || "Erro ao salvar notificação.", "error");
    } finally {
      setSavingAccess(false);
    }
  }

  function toggleSelectedAdmin(login) {
    const targetLogin = String(login || "").trim();
    if (!targetLogin) return;

    setSelectedAccessAdmins((prev) =>
      prev.includes(targetLogin)
        ? prev.filter((item) => item !== targetLogin)
        : [...prev, targetLogin],
    );
  }

  return (
    <div className="telegram-module-page">
      <div className="outer-card create-category-card telegram-module-card-shell">
        <div className="outer-card-header telegram-module-top-header">
          <div className="telegram-module-title-block">
            <h2>Configurar Bot Telegram</h2>
          </div>
        </div>

        <div className="categories-card">
          <div className="card-body">
            <section
              className="telegram-module-selector"
              aria-label="Módulos disponíveis"
            >
              <h2>Módulos disponíveis</h2>
              <p>
                Selecione um módulo para configurar o bot, o vínculo e as
                notificações.
              </p>
              <div className="telegram-module-list">
                {modules.map((module) => {
                  const active = module === safeSelectedModule;
                  return (
                    <button
                      key={module}
                      type="button"
                      className={`telegram-module-chip ${active ? "active" : ""}`}
                      onClick={() => setSelectedModule(module)}
                    >
                      {moduleLabel(module)}
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="telegram-module-stack">
              <section className="telegram-setup">
                <div className="telegram-setup-head">
                  <div>
                    <h3>Vínculo do administrador</h3>
                    <p>
                      Vincule o administrador logado ao Telegram do módulo já
                      selecionado.
                    </p>
                  </div>
                  <span className="telegram-pill ok">
                    Bot: {moduleLabel(safeSelectedModule)}
                  </span>
                </div>

                {loadingModuleData ? (
                  <p className="telegram-empty-state">Carregando vínculo...</p>
                ) : currentLogin ? (
                  <div className="telegram-self-link">
                    <div className="telegram-admin-info">
                      <strong>{currentLogin}</strong>
                      <small>
                        {currentAdminStatus?.linked
                          ? `Vinculado${currentAdminStatus.telegram_chat_id ? ` (${maskChatId(currentAdminStatus.telegram_chat_id)})` : ""}`
                          : "Sem Telegram vinculado neste módulo"}
                      </small>
                    </div>
                    <div className="telegram-admin-actions">
                      {currentAdminStatus?.linked ? (
                        <>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={handleTestCurrentAdmin}
                            disabled={
                              linkingSelf || unlinkingSelf || savingAccess
                            }
                          >
                            Testar mensagem
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            onClick={() => handleUnlinkAdmin(currentLogin)}
                            disabled={
                              linkingSelf || unlinkingSelf || savingAccess
                            }
                          >
                            {unlinkingSelf
                              ? "Desvinculando..."
                              : "Desvincular meu Telegram"}
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          onClick={() => handleGenerateLink(currentLogin)}
                          disabled={
                            linkingSelf || unlinkingSelf || savingAccess
                          }
                        >
                          {linkingSelf
                            ? "Gerando link..."
                            : "Vincular meu Telegram"}
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="telegram-empty-state">
                    Não foi possível identificar o administrador logado.
                  </p>
                )}
              </section>

              <form
                className="telegram-notify-form"
                onSubmit={handleSaveAccessNotification}
              >
                <section className="telegram-setup">
                  <div className="telegram-setup-head">
                    <div>
                      <h3>Notificação de acesso ao módulo</h3>
                      <p>
                        Envia uma mensagem aos administradores selecionados
                        sempre que alguém abrir este módulo.
                      </p>
                    </div>
                  </div>

                  <div>
                    <span className="telegram-checkbox-label">
                      Administrador(es) que recebem a mensagem
                    </span>
                    <div className="telegram-admin-checkbox-list">
                      {linkedAdmins.length === 0 ? (
                        <p className="telegram-empty-state">
                          Nenhum administrador vinculado.
                        </p>
                      ) : (
                        linkedAdmins.map((admin) => {
                          const checked = selectedAccessAdmins.includes(
                            admin.login,
                          );
                          return (
                            <label
                              key={admin.login}
                              className="telegram-admin-checkbox-item"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  toggleSelectedAdmin(admin.login)
                                }
                                disabled={loadingModuleData || savingAccess}
                              />
                              <span>
                                {admin.login}
                                {admin.telegram_chat_id
                                  ? ` - ${maskChatId(admin.telegram_chat_id)}`
                                  : ""}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <label className="telegram-checkbox-row">
                    <input
                      type="checkbox"
                      checked={accessEnabled}
                      onChange={(e) => setAccessEnabled(e.target.checked)}
                      disabled={loadingModuleData || savingAccess}
                    />
                    Enviar mensagem quando o módulo for acessado
                  </label>

                  <div className="telegram-actions">
                    <Button
                      type="submit"
                      disabled={loadingModuleData || savingAccess}
                    >
                      {savingAccess ? "Salvando..." : "Salvar notificação"}
                    </Button>
                  </div>
                </section>
              </form>

              <div className="telegram-config-embed">
                <TelegramBotConfig
                  selectedModule={safeSelectedModule}
                  availableModules={modules}
                  lockModule
                  noOuterCard
                />
              </div>
            </div>
          </div>
        </div>

        <div className="outer-card-footer telegram-module-footer">
          <Button variant="outline" onClick={onBack}>
            Voltar
          </Button>
        </div>
      </div>
    </div>
  );
}
