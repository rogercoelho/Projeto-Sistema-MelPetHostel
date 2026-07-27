import { useEffect, useState } from "react";
import { Button } from "../../components";
import AdminPageShell from "./AdminPageShell";
import {
  TELEGRAM_DEFAULT_TEST_MESSAGE,
  TELEGRAM_MODULE,
  createEmptyBot,
  fetchTelegramBot,
  formatTelegramBotName,
  getTelegramStatusInfo,
  sendTelegramTest,
} from "./telegramAdminUtils";

function TelegramTestPage({ onBack }) {
  const [bot, setBot] = useState(createEmptyBot());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [testMessage, setTestMessage] = useState(TELEGRAM_DEFAULT_TEST_MESSAGE);
  const [message, setMessage] = useState(null);

  const statusInfo = getTelegramStatusInfo(bot);
  const canSendTest = bot?.active && bot?.configured;

  async function loadBot() {
    setLoading(true);
    try {
      setBot(await fetchTelegramBot(TELEGRAM_MODULE));
    } catch (error) {
      setMessage({
        type: "erro",
        text: error.message || "Erro ao carregar bot.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBot();
  }, []);

  async function handleSendTest() {
    setSending(true);
    setMessage(null);
    try {
      const response = await sendTelegramTest({
        moduleKey: TELEGRAM_MODULE,
        message: testMessage.trim() || TELEGRAM_DEFAULT_TEST_MESSAGE,
      });
      setMessage({
        type: "sucesso",
        text: response?.mensagem || "Mensagem de teste enviada.",
      });
    } catch (error) {
      setMessage({
        type: "erro",
        text: error.message || "Erro ao enviar mensagem de teste.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <AdminPageShell
      title="Envio de mensagem de teste"
      description="Envie uma mensagem de teste para validar se o bot esta funcional."
      onBack={onBack}
    >
      <section className="admin-page-layout">
        <section className="admin-page-panel">
          <div className="admin-page-panel-title">
            <span>Teste</span>
            <h3>{formatTelegramBotName(bot)}</h3>
          </div>

          <div className="telegram-admin-status-card">
            <span className={`telegram-admin-pill ${statusInfo.tone}`}>
              {statusInfo.label}
            </span>
            <p>{statusInfo.description}</p>
          </div>

          <Button
            type="button"
            onClick={handleSendTest}
            disabled={loading || sending || !canSendTest}
          >
            {sending ? "Enviando..." : "Enviar mensagem de teste"}
          </Button>

          {!canSendTest ? (
            <p className="admin-page-message erro">
              O bot precisa estar configurado e ativo para enviar teste.
            </p>
          ) : null}

          {message ? (
            <p className={`admin-page-message ${message.type}`}>{message.text}</p>
          ) : null}
        </section>

        <section className="admin-page-panel">
          <div className="admin-page-panel-title">
            <span>Mensagem</span>
            <h3>Conteudo enviado</h3>
          </div>

          <textarea
            className="telegram-admin-preview"
            value={testMessage}
            onChange={(event) => setTestMessage(event.target.value)}
            rows={5}
            placeholder={TELEGRAM_DEFAULT_TEST_MESSAGE}
            aria-label="Mensagem de teste"
          />
        </section>
      </section>
    </AdminPageShell>
  );
}

export default TelegramTestPage;
