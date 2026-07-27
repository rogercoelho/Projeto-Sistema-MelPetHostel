import { useEffect, useState } from "react";
import { Button, Card } from "../../components";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import api from "../../services/api";
import MelPetHostel from "../MelPetHostel";
import Gerenciamento from "../Gerenciamento";
import AdminManagementModal from "./AdminManagementModal";
import ChangePasswordModal from "./ChangePasswordModal";
import SessionTimerBadge from "./SessionTimerBadge";
import {
  clearPasswordChangeFlagsFromStorage,
  isAdminUser,
  userNeedsPasswordChange,
} from "./utils";
import "./styles.css";

function Dashboard() {
  const { usuario, logout } = useAuth();
  const { showToast } = useToast();
  const [view, setView] = useState("home");
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [forcePasswordModalOpen, setForcePasswordModalOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);

  const usuarioGrupo = usuario && (usuario.grupoNome || usuario.grupo);
  const isAdmin = isAdminUser(usuario);
  const allowedModules = Array.isArray(usuario?.modules)
    ? usuario.modules
    : ["melpethostel"];
  const hasMelPetHostelAccess = allowedModules.includes("melpethostel");
  const shouldOpenMelPetDirectly = !isAdmin && hasMelPetHostelAccess;

  useEffect(() => {
    if (!usuario || isAdmin) {
      setForcePasswordModalOpen(false);
      return;
    }

    setForcePasswordModalOpen(userNeedsPasswordChange(usuario));
  }, [usuario, isAdmin]);

  async function changeOwnPassword(payload) {
    await api.post("/auth/alterar-senha", payload);
    clearPasswordChangeFlagsFromStorage();
    setPasswordModalOpen(false);
    setForcePasswordModalOpen(false);
    showToast("Senha alterada com sucesso.", "success");
  }

  const handleUserKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      setPasswordModalOpen(true);
    }
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>{isAdmin ? "Painel Administrativo" : "Mel Pet Hostel"}</h1>
          <div className="user-info">
            <span>
              Ola,{" "}
              <strong
                className="user-name"
                role="button"
                tabIndex={0}
                onClick={() => setPasswordModalOpen(true)}
                onKeyDown={handleUserKeyDown}
              >
                {usuario?.login}
              </strong>
            </span>

            {isAdmin ? (
              <strong
                className="user-badge"
                role="button"
                tabIndex={0}
                onClick={() => setAdminModalOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    setAdminModalOpen(true);
                  }
                }}
              >
                {usuarioGrupo || "Administrador"}
              </strong>
            ) : (
              <span className="user-badge">{usuarioGrupo}</span>
            )}

            <SessionTimerBadge />
            <Button variant="outline" size="sm" onClick={logout}>
              Sair
            </Button>
          </div>
        </div>
      </header>

      {shouldOpenMelPetDirectly ? (
        <MelPetHostel />
      ) : view === "home" ? (
        <main className="dashboard-content">
          {hasMelPetHostelAccess ? (
            <Card
              title="Mel Pet Hostel"
              className="card-categoria card-modulos"
            >
              <p className="card-descricao">Sistema de gestao Mel Pet Hostel</p>
              <Button fullWidth onClick={() => setView("mel")}>
                Acessar
              </Button>
            </Card>
          ) : null}

          {isAdmin ? (
            <Card
              title="Configurar Bot Telegram"
              className="card-categoria card-modulos"
            >
              <p className="card-descricao">
                Configuracao do bot para a Mel Pet Hostel
              </p>
              <Button fullWidth onClick={() => setView("telegram-bot-module")}>
                Acessar
              </Button>
            </Card>
          ) : null}
        </main>
      ) : view === "mel" ? (
        <MelPetHostel onBack={() => setView("home")} />
      ) : view === "telegram-bot-module" ? (
        <Gerenciamento onBack={() => setView("home")} />
      ) : null}

      <ChangePasswordModal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        onSubmit={changeOwnPassword}
        title="Alterar Senha"
      />

      <ChangePasswordModal
        isOpen={forcePasswordModalOpen}
        onClose={logout}
        onSubmit={changeOwnPassword}
        title="Primeiro acesso - alterar senha"
        currentLabel="Senha provisoria atual"
        closeOnBackdropClick={false}
        description="Detectamos que esta e sua primeira entrada no sistema. Altere sua senha para continuar. Fechar este modal encerra a sessao."
      />

      <AdminManagementModal
        isOpen={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
      />
    </div>
  );
}

export default Dashboard;
