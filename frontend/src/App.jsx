import { AuthProvider, useAuth, useSession } from "./contexts/AuthContext";
import { useToast } from "./components/Toast/ToastContext";
import { Button, Modal } from "./components";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import { formatSessionTime } from "./utils/session";
import { useState } from "react";

// Session warning modal — lives at App level so it doesn't re-render Dashboard
function SessionWarningModal() {
  const {
    tempoRestante,
    showSessionWarning,
    renovarSessao,
    fecharAlertaSessao,
  } = useSession();
  const { showToast } = useToast();
  const [renovando, setRenovando] = useState(false);

  return (
    <Modal
      isOpen={showSessionWarning}
      onClose={fecharAlertaSessao}
      title="Sessão expirando"
      closeOnBackdropClick={false}
      showCloseButton={false}
      containerStyle={{ maxWidth: 400 }}
    >
      <div style={{ padding: "4px 0" }}>
        <p style={{ margin: 0, marginBottom: 16 }}>
          Sua sessão expira em{" "}
          <strong style={{ color: "#c0392b" }}>
            {formatSessionTime(tempoRestante)}
          </strong>
          . Deseja renovar por mais uma hora?
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button
            type="button"
            variant="secondary"
            onClick={fecharAlertaSessao}
            disabled={renovando}
          >
            Ok
          </Button>
          <Button
            type="button"
            onClick={async () => {
              setRenovando(true);
              try {
                await renovarSessao();
                showToast("Sessão renovada por mais 1 hora.", "success");
              } catch {
                showToast("Não foi possível renovar a sessão.", "error");
              } finally {
                setRenovando(false);
              }
            }}
            disabled={renovando}
          >
            {renovando ? "Renovando..." : "Renovar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AppContent() {
  const { usuario, carregando } = useAuth();

  if (carregando) {
    return (
      <div className="loading-container">
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <>
      {usuario ? <Dashboard /> : <Login />}
      {usuario && <SessionWarningModal />}
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
