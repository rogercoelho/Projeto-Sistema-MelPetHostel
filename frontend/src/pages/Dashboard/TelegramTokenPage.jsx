import { useEffect, useState } from "react";
import { Button } from "../../components";
import AdminPageShell from "./AdminPageShell";
import {
  TELEGRAM_MODULE,
  TELEGRAM_TIMEZONE,
  createEmptyBot,
  fetchTelegramBot,
  formatTelegramBotName,
  getTelegramStatusInfo,
  saveTelegramBotConfig,
} from "./telegramAdminUtils";

function TelegramTokenPage({ onBack }) {
  const [bot, setBot] = useState(createEmptyBot());
  const [botToken, setBotToken] = useState("");
  const [defaultTimezone, setDefaultTimezone] = useState(TELEGRAM_TIMEZONE);
  const [pollingEnabled, setPollingEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const statusInfo = getTelegramStatusInfo(bot);

  useEffect(() => {
    let mounted = true;

    async function loadBot() {
      setLoading(true);
      try {
        const data = await fetchTelegramBot(TELEGRAM_MODULE);
        if (!mounted) return;
        setBot(data);
        setDefaultTimezone(data.defaultTimezone || TELEGRAM_TIMEZONE);
        setPollingEnabled(data.pollingEnabled !== false);
      } catch (error) {
        if (mounted) {
          setMessage({
            type: "erro",
            text: error.message || "Erro ao carregar configuracao.",
          });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadBot();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSave(event) {
    event.preventDefault();

    if (!botToken.trim() && !bot?.saved) {
      setMessage({ type: "erro", text: "Informe o token do bot." });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveTelegramBotConfig({
        moduleKey: TELEGRAM_MODULE,
        botToken: botToken.trim(),
        defaultTimezone: defaultTimezone.trim() || TELEGRAM_TIMEZONE,
        pollingEnabled,
      });
      setBot(saved);
      setBotToken("");
      setMessage({ type: "sucesso", text: "Token salvo no banco de dados." });
    } catch (error) {
      setMessage({
        type: "erro",
        text: error.message || "Erro ao salvar token.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPageShell
      title="Token salvo no banco de dados"
      description="Configure ou atualize o token do bot Telegram usado pelo sistema."
      onBack={onBack}
    >
      <section className="admin-page-layout">
        <form className="admin-page-panel admin-page-form" onSubmit={handleSave}>
          <div className="admin-page-panel-title">
            <span>Configuracao</span>
            <h3>Token do bot</h3>
          </div>

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
              placeholder={TELEGRAM_TIMEZONE}
            />
          </label>

          <label className="admin-page-checkbox">
            <input
              type="checkbox"
              checked={pollingEnabled}
              onChange={(event) => setPollingEnabled(event.target.checked)}
            />
            Polling ativo para receber o /start dos usuarios
          </label>

          <Button type="submit" disabled={saving || loading}>
            {saving ? "Salvando..." : "Salvar configuracao"}
          </Button>

          {message ? (
            <p className={`admin-page-message ${message.type}`}>{message.text}</p>
          ) : null}
        </form>

        <section className="admin-page-panel">
          <div className="admin-page-panel-title">
            <span>Status atual</span>
            <h3>{formatTelegramBotName(bot)}</h3>
          </div>

          <div className="telegram-admin-status-grid">
            <article>
              <span>Status</span>
              <strong>{statusInfo.label}</strong>
              <small>{statusInfo.description}</small>
            </article>
            <article>
              <span>Token</span>
              <strong>{bot?.tokenMasked || "Nao salvo"}</strong>
              <small>O token completo nunca aparece na tela.</small>
            </article>
            <article>
              <span>Operacao</span>
              <strong>{bot?.pollingEnabled ? "Polling ativo" : "Somente envio"}</strong>
              <small>{bot?.defaultTimezone || TELEGRAM_TIMEZONE}</small>
            </article>
          </div>
        </section>
      </section>
    </AdminPageShell>
  );
}

export default TelegramTokenPage;

