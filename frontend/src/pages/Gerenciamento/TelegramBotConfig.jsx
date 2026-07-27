import { useCallback, useEffect, useState } from "react";
import { Button } from "../../components";
import { api } from "../../services/api";
import { useToast } from "../../components/Toast/ToastContext";
import "./styles.css";

const DEFAULT_MODULE = "melpethostel";
const DEFAULT_TIMEZONE = "America/Sao_Paulo";

function normalizeModuleKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function createEmptyBot(moduleKey = DEFAULT_MODULE) {
  return {
    module: moduleKey,
    saved: false,
    configured: false,
    active: false,
    username: "",
    name: "",
    defaultTimezone: DEFAULT_TIMEZONE,
    pollingEnabled: true,
    tokenMasked: "",
    validationError: "",
  };
}

function getStatusInfo(bot) {
  if (bot?.validationError) {
    return {
      label: "Erro",
      tone: "warn",
      description: bot.validationError,
    };
  }

  if (bot?.active && bot?.configured) {
    return {
      label: "Ativo",
      tone: "ok",
      description: "Recebendo comandos e pronto para enviar notificacoes.",
    };
  }

  if (bot?.saved) {
    return {
      label: "Inativo",
      tone: "warn",
      description: "A configuracao esta salva, mas o bot esta parado.",
    };
  }

  return {
    label: "Nao configurado",
    tone: "",
    description: "Salve o token para ativar o bot.",
  };
}

function formatBotName(bot) {
  if (bot?.username) return `@${bot.username}`;
  if (bot?.name) return bot.name;
  if (bot?.saved) return "Salvo no banco";
  return "Nao configurado";
}

export default function TelegramBotConfig({
  selectedModule = DEFAULT_MODULE,
  noOuterCard = false,
}) {
  const normalizedSelectedModule =
    normalizeModuleKey(selectedModule) || DEFAULT_MODULE;
  const [moduleKey, setModuleKey] = useState(normalizedSelectedModule);
  const [bot, setBot] = useState(createEmptyBot(normalizedSelectedModule));
  const [botToken, setBotToken] = useState("");
  const [defaultTimezone, setDefaultTimezone] = useState(DEFAULT_TIMEZONE);
  const [pollingEnabled, setPollingEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [toggling, setToggling] = useState(false);

  const { showToast } = useToast();
  const activeModule = normalizeModuleKey(moduleKey) || DEFAULT_MODULE;
  const statusInfo = getStatusInfo(bot);
  const hasSavedBot = !!bot?.saved;
  const nextActiveState = !bot?.active;

  const applyBotState = useCallback((nextBot, fallbackModule = DEFAULT_MODULE) => {
    const normalizedModule =
      normalizeModuleKey(nextBot?.module) ||
      normalizeModuleKey(fallbackModule) ||
      DEFAULT_MODULE;
    const normalizedBot = {
      ...createEmptyBot(normalizedModule),
      ...(nextBot || {}),
      module: normalizedModule,
    };

    setBot(normalizedBot);
    setModuleKey(normalizedModule);
    setDefaultTimezone(normalizedBot.defaultTimezone || DEFAULT_TIMEZONE);
    setPollingEnabled(normalizedBot.pollingEnabled !== false);
  }, []);

  useEffect(() => {
    setModuleKey(normalizedSelectedModule);
  }, [normalizedSelectedModule]);

  useEffect(() => {
    let mounted = true;
    const targetModule = activeModule;

    async function loadBot() {
      setLoading(true);
      try {
        const data = await api.get(
          `/melpethostel/telegram/bot?module=${encodeURIComponent(targetModule)}`,
        );
        if (mounted) applyBotState(data, targetModule);
      } catch (err) {
        if (mounted) {
          showToast(err.message || "Erro ao carregar bot.", "error");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadBot();
    return () => {
      mounted = false;
    };
  }, [activeModule, applyBotState, showToast]);

  async function handleSave(event) {
    event?.preventDefault?.();

    if (!botToken.trim() && !bot?.saved) {
      showToast("Informe o token do bot.", "error");
      return;
    }

    setSaving(true);
    try {
      const saved = await api.post("/melpethostel/telegram/bot", {
        module: activeModule,
        botToken: botToken.trim() || undefined,
        defaultTimezone: defaultTimezone.trim() || DEFAULT_TIMEZONE,
        pollingEnabled,
      });

      applyBotState(saved, activeModule);
      setBotToken("");
      showToast("Bot salvo e ativado.", "success");
    } catch (err) {
      showToast(err.message || "Erro ao salvar bot.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSendTest() {
    if (!bot?.active || !bot?.configured) {
      showToast("Ative o bot antes de enviar o teste.", "error");
      return;
    }

    setTestSending(true);
    try {
      const res = await api.post("/melpethostel/telegram/test", {
        module: activeModule,
      });
      showToast(res?.mensagem || "Mensagem de teste enviada.", "success");
    } catch (err) {
      showToast(err.message || "Erro ao enviar mensagem de teste.", "error");
    } finally {
      setTestSending(false);
    }
  }

  async function handleToggleActive() {
    const action = nextActiveState ? "ativar" : "desativar";
    const message = nextActiveState
      ? "Ativar o bot salvo no banco?"
      : "Desativar o bot? Os vinculos e notificacoes do Telegram ficarao parados ate uma nova ativacao.";

    if (!window.confirm(message)) return;

    setToggling(true);
    try {
      const res = await api.post("/melpethostel/telegram/bot/status", {
        module: activeModule,
        active: nextActiveState,
      });
      applyBotState(res?.bot || res, activeModule);
      showToast(
        res?.mensagem ||
          (nextActiveState ? "Bot ativado." : "Bot desativado."),
        "success",
      );
    } catch (err) {
      showToast(err.message || `Erro ao ${action} bot.`, "error");
    } finally {
      setToggling(false);
    }
  }

  const inner = (
    <div className="telegram-bot-config">
      <div className="categories-card">
        <div className="card-body">
          <form className="create-category-form" onSubmit={handleSave}>
            <section className="telegram-setup">
              <div className="telegram-setup-head">
                <div>
                  <h3>Bot Telegram</h3>
                  <p>
                    Configure o bot usado para vinculos de usuarios e
                    notificacoes administrativas.
                  </p>
                </div>
                <span className={`telegram-pill ${statusInfo.tone}`}>
                  {statusInfo.label}
                </span>
              </div>

              <div className="telegram-status-grid">
                <div>
                  <span className="telegram-label">Status</span>
                  <strong>{statusInfo.label}</strong>
                  <small>{statusInfo.description}</small>
                </div>

                <div>
                  <span className="telegram-label">Bot</span>
                  <strong>{formatBotName(bot)}</strong>
                  <small>
                    {bot?.active
                      ? "Registro ativo no banco."
                      : "Registro mantido no banco para reativacao."}
                  </small>
                </div>

                <div>
                  <span className="telegram-label">Token</span>
                  <strong>{bot?.tokenMasked || "Nao salvo"}</strong>
                  <small>O token completo nunca aparece na tela.</small>
                </div>

                <div>
                  <span className="telegram-label">Operacao</span>
                  <strong>
                    {bot?.pollingEnabled ? "Polling ativo" : "Somente envio"}
                  </strong>
                  <small>{bot?.defaultTimezone || DEFAULT_TIMEZONE}</small>
                </div>
              </div>
            </section>

            <label>
              Token do bot
              <input
                type="password"
                value={botToken}
                onChange={(event) => setBotToken(event.target.value)}
                placeholder={
                  bot?.saved
                    ? "Deixe em branco para manter o token atual"
                    : "Cole o token gerado pelo BotFather"
                }
                autoComplete="off"
              />
            </label>

            <label>
              Fuso horario padrao
              <input
                type="text"
                value={defaultTimezone}
                onChange={(event) => setDefaultTimezone(event.target.value)}
                placeholder={DEFAULT_TIMEZONE}
              />
            </label>

            <label className="telegram-checkbox-row">
              <input
                type="checkbox"
                checked={pollingEnabled}
                onChange={(event) => setPollingEnabled(event.target.checked)}
              />
              Polling ativo para receber o /start dos usuarios
            </label>

            <div className="telegram-actions">
              <Button type="submit" disabled={saving || loading || toggling}>
                {saving ? "Validando..." : "Salvar configuracao"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleSendTest}
                disabled={
                  loading ||
                  saving ||
                  toggling ||
                  testSending ||
                  !bot?.active ||
                  !bot?.configured
                }
              >
                {testSending ? "Enviando..." : "Enviar teste"}
              </Button>
              {hasSavedBot ? (
                <Button
                  type="button"
                  variant={bot?.active ? "danger" : "success"}
                  onClick={handleToggleActive}
                  disabled={toggling || saving || loading}
                >
                  {toggling
                    ? nextActiveState
                      ? "Ativando..."
                      : "Desativando..."
                    : nextActiveState
                      ? "Ativar Bot"
                      : "Desativar Bot"}
                </Button>
              ) : null}
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  if (noOuterCard) return inner;

  return (
    <div className="telegram-bot-config">
      <div className="outer-card create-category-card" role="dialog">
        <div className="outer-card-header">
          <h2>Configurar Bot Telegram</h2>
        </div>

        {inner}
      </div>
    </div>
  );
}
