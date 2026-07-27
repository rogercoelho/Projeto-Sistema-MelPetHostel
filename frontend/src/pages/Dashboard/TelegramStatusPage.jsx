import { useEffect, useState } from "react";
import { Button } from "../../components";
import AdminPageShell from "./AdminPageShell";
import {
  TELEGRAM_MODULE,
  createEmptyBot,
  fetchTelegramBot,
  formatTelegramBotName,
  getTelegramStatusInfo,
  setTelegramBotActive,
} from "./telegramAdminUtils";

function TelegramStatusPage({ onBack }) {
  const [bot, setBot] = useState(createEmptyBot());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const statusInfo = getTelegramStatusInfo(bot);
  const nextActiveState = !bot?.active;

  async function loadBot() {
    setLoading(true);
    try {
      setBot(await fetchTelegramBot(TELEGRAM_MODULE));
    } catch (error) {
      setMessage({
        type: "erro",
        text: error.message || "Erro ao carregar status.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBot();
  }, []);

  async function handleToggleStatus() {
    setSaving(true);
    setMessage(null);
    try {
      const updated = await setTelegramBotActive({
        moduleKey: TELEGRAM_MODULE,
        active: nextActiveState,
      });
      setBot(updated);
      setMessage({
        type: "sucesso",
        text: updated.active ? "Bot ativado." : "Bot desativado.",
      });
    } catch (error) {
      setMessage({
        type: "erro",
        text: error.message || "Erro ao alterar status do bot.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPageShell
      title="Ativacao ou desativacao do bot"
      description="Controle se o bot Telegram fica ativo ou inativo no banco de dados."
      onBack={onBack}
    >
      <section className="admin-page-layout">
        <section className="admin-page-panel">
          <div className="admin-page-panel-title">
            <span>Bot Telegram</span>
            <h3>{formatTelegramBotName(bot)}</h3>
          </div>

          <div className="telegram-admin-status-card">
            <span className={`telegram-admin-pill ${statusInfo.tone}`}>
              {statusInfo.label}
            </span>
            <p>{statusInfo.description}</p>
          </div>

          <div className="admin-page-actions">
            <Button
              type="button"
              variant={bot?.active ? "danger" : "success"}
              onClick={handleToggleStatus}
              disabled={loading || saving || !bot?.saved}
            >
              {saving
                ? nextActiveState
                  ? "Ativando..."
                  : "Desativando..."
                : nextActiveState
                  ? "Ativar Bot"
                  : "Desativar Bot"}
            </Button>
            <Button type="button" variant="secondary" onClick={loadBot} disabled={loading || saving}>
              Atualizar status
            </Button>
          </div>

          {!bot?.saved ? (
            <p className="admin-page-message erro">
              Salve o token do bot antes de ativar ou desativar.
            </p>
          ) : null}

          {message ? (
            <p className={`admin-page-message ${message.type}`}>{message.text}</p>
          ) : null}
        </section>

        <section className="admin-page-panel">
          <div className="admin-page-panel-title">
            <span>Resumo</span>
            <h3>Configuracao atual</h3>
          </div>

          <div className="telegram-admin-status-grid">
            <article>
              <span>Registro</span>
              <strong>{bot?.saved ? "Salvo no banco" : "Nao salvo"}</strong>
            </article>
            <article>
              <span>Token</span>
              <strong>{bot?.tokenMasked || "Nao salvo"}</strong>
            </article>
            <article>
              <span>Operacao</span>
              <strong>{bot?.pollingEnabled ? "Polling ativo" : "Somente envio"}</strong>
            </article>
          </div>
        </section>
      </section>
    </AdminPageShell>
  );
}

export default TelegramStatusPage;

