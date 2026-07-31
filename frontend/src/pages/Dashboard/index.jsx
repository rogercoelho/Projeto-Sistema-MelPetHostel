import { useEffect, useRef, useState } from "react";
import { Button } from "../../components";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import api from "../../services/api";
import MelPetHostel from "../MelPetHostel";
import melPetLogo from "../MelPetHostel/assets/MelPetHostel_Logo.jpeg";
import AdminGroupsPage from "./AdminGroupsPage";
import AdminPasswordsPage from "./AdminPasswordsPage";
import AdminUsersPage from "./AdminUsersPage";
import ChangePasswordModal from "./ChangePasswordModal";
import ClientProfileModal from "./ClientProfileModal";
import SessionTimerBadge from "./SessionTimerBadge";
import TelegramStatusPage from "./TelegramStatusPage";
import TelegramTestPage from "./TelegramTestPage";
import TelegramTokenPage from "./TelegramTokenPage";
import {
  clearPasswordChangeFlagsFromStorage,
  isAdminUser,
  userNeedsPasswordChange,
} from "./utils";
import "./styles.css";

function Dashboard() {
  const { usuario, logout } = useAuth();
  const { showToast } = useToast();
  const userModuleGateCheckedRef = useRef(false);
  const [view, setView] = useState("home");
  const [moduleGateLoading, setModuleGateLoading] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [forcePasswordModalOpen, setForcePasswordModalOpen] = useState(false);
  const [openAdminSection, setOpenAdminSection] = useState("melpethostel");
  const [melComplianceGate, setMelComplianceGate] = useState(false);
  const [contractPromptRequest, setContractPromptRequest] = useState(0);
  const [clientProfileModalOpen, setClientProfileModalOpen] = useState(false);
  const [clientProfileInitial, setClientProfileInitial] = useState(null);
  const [clientProfileStatus, setClientProfileStatus] = useState({
    loaded: false,
    pendente: false,
  });
  const [openContractAfterClientProfile, setOpenContractAfterClientProfile] =
    useState(false);

  const usuarioGrupo = usuario && (usuario.grupoNome || usuario.grupo);
  const isAdmin = isAdminUser(usuario);
  const allowedModules = Array.isArray(usuario?.modules)
    ? usuario.modules
    : ["melpethostel"];
  const hasMelPetHostelAccess = allowedModules.includes("melpethostel");

  function openMelPetRegistration() {
    setMelComplianceGate(false);
    setView("mel");
  }

  const dashboardSections = [
    hasMelPetHostelAccess
      ? {
          id: "melpethostel",
          title: "Mel Pet Hostel",
          summary: "Acesse o sistema operacional do pet hotel.",
          items: [
            {
              label: "Cadastro de tutores e pets.",
              onAction: openMelPetRegistration,
            },
            "Contrato, documentos e anamnese",
            "Presenca, hospedagem e rotina do pet",
          ],
        }
      : null,
    isAdmin
      ? {
          id: "usuarios",
          title: "Gerenciar Grupos e Usuarios",
          summary: "Cadastre grupos, crie usuarios e altere senhas de acesso.",
          items: [
            {
              label: "Criacao e edicao de usuarios",
              onAction: () => setView("admin-users"),
            },
            {
              label: "Vinculo de grupos e permissoes",
              onAction: () => setView("admin-groups"),
            },
            {
              label: "Alteracao de senha administrativa",
              onAction: () => setView("admin-passwords"),
            },
          ],
        }
      : null,
    isAdmin
      ? {
          id: "telegram",
          title: "Configurar Bot Telegram",
          summary: "Configure o bot usado para alertas e notificacoes.",
          items: [
            {
              label: "Token salvo no banco de dados",
              onAction: () => setView("telegram-token"),
            },
            {
              label: "Ativacao ou desativacao do bot",
              onAction: () => setView("telegram-status"),
            },
            {
              label: "Envio de mensagem de teste",
              onAction: () => setView("telegram-test"),
            },
          ],
        }
      : null,
  ].filter(Boolean);

  useEffect(() => {
    userModuleGateCheckedRef.current = false;
    setView("home");
    setModuleGateLoading(false);
    setMelComplianceGate(false);
  }, [usuario?.id, usuario?.login]);

  useEffect(() => {
    if (!usuario || isAdmin) {
      setForcePasswordModalOpen(false);
      setClientProfileStatus({ loaded: true, pendente: false });
      return;
    }

    setForcePasswordModalOpen(userNeedsPasswordChange(usuario));
  }, [usuario, isAdmin]);

  useEffect(() => {
    let ignore = false;

    if (!usuario || isAdmin || forcePasswordModalOpen) {
      return () => {
        ignore = true;
      };
    }

    if (userNeedsPasswordChange(usuario)) {
      return () => {
        ignore = true;
      };
    }

    setClientProfileStatus({ loaded: false, pendente: false });

    (async () => {
      try {
        const data = await api.get("/auth/me/cliente");
        if (ignore) return;
        const pendente = updateClientProfileStatus(data);
        if (pendente) {
          setClientProfileModalOpen(true);
        }
      } catch (error) {
        console.debug("Cadastro do cliente nao carregado:", error?.message);
        if (!ignore) {
          setClientProfileInitial(null);
          setClientProfileStatus({ loaded: true, pendente: true });
          setClientProfileModalOpen(true);
        }
      }
    })();

    return () => {
      ignore = true;
    };
  }, [forcePasswordModalOpen, isAdmin, usuario]);

  useEffect(() => {
    let ignore = false;

    if (
      !usuario ||
      isAdmin ||
      !hasMelPetHostelAccess ||
      view !== "home" ||
      !clientProfileStatus.loaded ||
      clientProfileStatus.pendente ||
      forcePasswordModalOpen ||
      userModuleGateCheckedRef.current
    ) {
      setModuleGateLoading(false);
      return () => {
        ignore = true;
      };
    }

    userModuleGateCheckedRef.current = true;
    setModuleGateLoading(true);

    (async () => {
      try {
        const data = await api.get("/melpethostel/contratos/status");
        if (ignore) return;

        if (!data?.contratoValido) {
          setMelComplianceGate(true);
          setView("mel");
          setContractPromptRequest((current) => current + 1);
        }
      } catch (error) {
        console.debug("Status do contrato nao carregado:", error?.message);
      } finally {
        if (!ignore) {
          setModuleGateLoading(false);
        }
      }
    })();

    return () => {
      ignore = true;
    };
  }, [
    clientProfileStatus.loaded,
    clientProfileStatus.pendente,
    forcePasswordModalOpen,
    hasMelPetHostelAccess,
    isAdmin,
    usuario,
    view,
  ]);

  async function changeOwnPassword(payload) {
    await api.post("/auth/alterar-senha", payload);
    clearPasswordChangeFlagsFromStorage();
    setPasswordModalOpen(false);
    setForcePasswordModalOpen(false);
    showToast("Senha alterada com sucesso.", "success");
  }

  function updateClientProfileStatus(data) {
    const pendente = Boolean(data?.pendente || data?.cadastroCompleto === false);
    setClientProfileInitial(data?.cliente || null);
    setClientProfileStatus({
      loaded: true,
      pendente,
    });
    return pendente;
  }

  async function loadClientProfile(forceOpen = false) {
    const data = await api.get("/auth/me/cliente");
    const pendente = updateClientProfileStatus(data);
    if (forceOpen || pendente) {
      setClientProfileModalOpen(true);
    }
    return data;
  }

  async function changeFirstAccessPassword(payload) {
    await changeOwnPassword(payload);
    if (!isAdmin) {
      const data = await loadClientProfile(false);
      if (data?.pendente || data?.cadastroCompleto === false) {
        setOpenContractAfterClientProfile(true);
        setClientProfileModalOpen(true);
        return;
      }

      setOpenContractAfterClientProfile(false);
      setMelComplianceGate(true);
      setView("mel");
      setContractPromptRequest((current) => current + 1);
      return;
    }

    setContractPromptRequest((current) => current + 1);
  }

  async function saveClientProfile(payload) {
    const data = await api.put("/auth/me/cliente", payload);
    const pendente = updateClientProfileStatus(data);
    if (pendente) {
      setClientProfileModalOpen(true);
      showToast("Complete todos os dados cadastrais obrigatorios.", "error");
      return;
    }

    setClientProfileModalOpen(false);
    showToast("Cadastro atualizado com sucesso.", "success");

    if (openContractAfterClientProfile) {
      setOpenContractAfterClientProfile(false);
      setMelComplianceGate(true);
      setView("mel");
      setContractPromptRequest((current) => current + 1);
    }
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
          <div className="dashboard-brand">
            <img src={melPetLogo} alt="Mel Pet Hostel" />
            <h1>{isAdmin ? "Painel Administrativo" : "Mel Pet Hostel"}</h1>
          </div>

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
              <span className="user-badge">{usuarioGrupo || "Administrador"}</span>
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

      {moduleGateLoading ? (
        <main className="dashboard-content">
          <section className="admin-home-panel">
            <p>Verificando contrato do usuário...</p>
          </section>
        </main>
      ) : view === "home" ? (
        <main className="dashboard-content">
          <section className="admin-home-panel">
            <div className="admin-accordion" aria-label="Modulos administrativos">
              {dashboardSections.map((section) => {
                const isOpen = openAdminSection === section.id;

                return (
                  <section
                    className={`admin-accordion-section ${isOpen ? "is-open" : ""}`}
                    key={section.id}
                  >
                    <button
                      className="admin-accordion-trigger"
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() =>
                        setOpenAdminSection((current) =>
                          current === section.id ? "" : section.id,
                        )
                      }
                    >
                      <span>
                        <strong>{section.title}</strong>
                        <small>{section.summary}</small>
                      </span>
                    </button>

                    {isOpen ? (
                      <div className="admin-accordion-content">
                        <ul>
                          {section.items.map((item) => (
                            <li key={item.label || item}>
                              {typeof item === "string" ? (
                                <span className="admin-static-item">{item}</span>
                              ) : (
                                <button type="button" onClick={item.onAction}>
                                  <strong>{item.label}</strong>
                                  {item.description ? <span>{item.description}</span> : null}
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>

                        {section.actionLabel ? (
                          <Button type="button" onClick={section.onAction}>
                            {section.actionLabel}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </section>
        </main>
      ) : view === "mel" ? (
        <MelPetHostel
          onBack={() => {
            setMelComplianceGate(false);
            setView("home");
          }}
          clientProfile={clientProfileInitial}
          clientProfileReady={clientProfileStatus.loaded}
          clientProfilePending={clientProfileStatus.pendente}
          enforceContractGate={melComplianceGate}
          contractPromptRequest={contractPromptRequest}
        />
      ) : view === "admin-users" ? (
        <AdminUsersPage onBack={() => setView("home")} />
      ) : view === "admin-groups" ? (
        <AdminGroupsPage onBack={() => setView("home")} />
      ) : view === "admin-passwords" ? (
        <AdminPasswordsPage onBack={() => setView("home")} />
      ) : view === "telegram-token" ? (
        <TelegramTokenPage onBack={() => setView("home")} />
      ) : view === "telegram-status" ? (
        <TelegramStatusPage onBack={() => setView("home")} />
      ) : view === "telegram-test" ? (
        <TelegramTestPage onBack={() => setView("home")} />
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
        onSubmit={changeFirstAccessPassword}
        title="Primeiro acesso - alterar senha"
        currentLabel="Senha provisoria atual"
        closeOnBackdropClick={false}
        description="Detectamos que esta e sua primeira entrada no sistema. Altere sua senha para continuar. Fechar este modal encerra a sessao."
      />

      <ClientProfileModal
        isOpen={clientProfileModalOpen}
        onClose={logout}
        onSubmit={saveClientProfile}
        initialCliente={clientProfileInitial}
      />

    </div>
  );
}

export default Dashboard;
