import { useEffect, useRef, useState } from "react";
import {
  Button,
  MenuItem,
  MenuList,
  MenuPanel,
  MenuTemplate,
} from "../../components";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import api from "../../services/api";
import MelPetHostel from "../MelPetHostel";
import MelPetTutorMaintenancePage from "./MelPetTutorMaintenancePage";
import melPetLogo from "../MelPetHostel/assets/MelPetHostel_Logo.jpeg";
import AdminGroupsPage from "./AdminGroupsPage";
import AdminUserMaintenancePage from "./AdminUserMaintenancePage";
import AdminUsersPage from "./AdminUsersPage";
import ChangePasswordModal from "./ChangePasswordModal";
import ClientProfileModal from "./ClientProfileModal";
import ClientProfilePage from "./ClientProfilePage";
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
  const [openDashboardSection, setOpenDashboardSection] = useState("");
  const [moduleGateLoading, setModuleGateLoading] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [forcePasswordModalOpen, setForcePasswordModalOpen] = useState(false);
  const [melComplianceGate, setMelComplianceGate] = useState(false);
  const [melPetRegistrationOnly, setMelPetRegistrationOnly] = useState(false);
  const [melInitialAdminMenu, setMelInitialAdminMenu] = useState("");
  const [melUserMenu, setMelUserMenu] = useState("");
  const [contractPromptRequest, setContractPromptRequest] = useState(0);
  const [clientProfileModalOpen, setClientProfileModalOpen] = useState(false);
  const [clientProfileInitial, setClientProfileInitial] = useState(null);
  const [clientProfilePageLoading, setClientProfilePageLoading] =
    useState(false);
  const [clientProfilePageError, setClientProfilePageError] = useState("");
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

  function openMelPetTutorMaintenance() {
    setMelPetRegistrationOnly(false);
    setMelComplianceGate(false);
    setMelInitialAdminMenu("");
    setMelUserMenu("");
    setOpenDashboardSection("");
    setView("mel-tutor-maintenance");
  }

  function openMelPetRegistration() {
    setMelPetRegistrationOnly(true);
    setMelComplianceGate(false);
    setMelInitialAdminMenu("");
    setMelUserMenu("");
    setOpenDashboardSection("");
    setView("mel");
  }

  function openMelPetHosting() {
    setMelPetRegistrationOnly(false);
    setMelComplianceGate(false);
    setMelInitialAdminMenu("");
    setMelUserMenu("hospedagem");
    setOpenDashboardSection("");
    setView("mel");
  }

  function openMelPetHostingAdmin() {
    setMelPetRegistrationOnly(false);
    setMelComplianceGate(false);
    setMelInitialAdminMenu("aprovarHospedagens");
    setMelUserMenu("");
    setOpenDashboardSection("");
    setView("mel");
  }

  async function openClientProfilePage() {
    setOpenDashboardSection("");
    setView("client-profile");
    setClientProfilePageLoading(true);
    setClientProfilePageError("");
    try {
      await loadClientProfile(false);
    } catch (error) {
      setClientProfilePageError(
        error?.message || "Não foi possível carregar seus dados cadastrais.",
      );
    } finally {
      setClientProfilePageLoading(false);
    }
  }

  function openMelPetPlans() {
    setMelPetRegistrationOnly(false);
    setMelComplianceGate(false);
    setMelInitialAdminMenu("controlePlanos");
    setMelUserMenu("");
    setOpenDashboardSection("");
    setView("mel");
  }

  function openMelPetPetsAdmin() {
    setMelPetRegistrationOnly(false);
    setMelComplianceGate(false);
    setMelInitialAdminMenu("cadastroPets");
    setMelUserMenu("");
    setOpenDashboardSection("");
    setView("mel");
  }

  const melPetHostelItems = isAdmin
    ? [
        {
          label: "Manutenção de Tutor",
          onAction: openMelPetTutorMaintenance,
        },
        {
          label: "Cadastro de Pets",
          onAction: openMelPetPetsAdmin,
        },
        {
          label: "Controle de Planos",
          onAction: openMelPetPlans,
        },
        {
          label: "Hospedagem",
          onAction: openMelPetHostingAdmin,
        },
      ]
    : [
        ...(melPetRegistrationOnly
          ? []
          : [
              {
                label: "Meus Dados Cadastrais",
                onAction: openClientProfilePage,
              },
            ]),
        {
          label: "Cadastro de Pets",
          onAction: openMelPetRegistration,
        },
        ...(melPetRegistrationOnly
          ? []
          : [
              {
                label: "Hospedagem",
                onAction: openMelPetHosting,
              },
            ]),
      ];

  const dashboardSections = [
    isAdmin
      ? {
          id: "usuarios",
          title: "Administração de Usuários",
          summary: "Cadastre grupos, crie usuarios e altere senhas de acesso.",
          items: [
            {
              label: "Criar Usuário",
              onAction: () => openView("admin-users"),
            },
            {
              label: "Criar Grupo",
              onAction: () => openView("admin-groups"),
            },
            {
              label: "Manutenção de Usuários",
              onAction: () => openView("admin-user-maintenance"),
            },
          ],
        }
      : null,
    hasMelPetHostelAccess
      ? {
          id: "melpethostel",
          title: "Mel Pet Hostel",
          summary: "Acesse o sistema operacional do pet hotel.",
          items: melPetHostelItems,
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
              onAction: () => openView("telegram-token"),
            },
            {
              label: "Ativacao ou desativacao do bot",
              onAction: () => openView("telegram-status"),
            },
            {
              label: "Envio de mensagem de teste",
              onAction: () => openView("telegram-test"),
            },
          ],
        }
      : null,
  ].filter(Boolean);

  useEffect(() => {
    userModuleGateCheckedRef.current = false;
    setView("home");
    setOpenDashboardSection("");
    setModuleGateLoading(false);
    setMelComplianceGate(false);
    setMelPetRegistrationOnly(false);
    setMelInitialAdminMenu("");
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
          return;
        }

        const petOnboarding = await api.get(
          "/melpethostel/pets/onboarding-status",
        );
        if (!petOnboarding?.complete) {
          setMelComplianceGate(true);
          setMelPetRegistrationOnly(true);
          setView("mel");
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
    const pendente = Boolean(
      data?.pendente || data?.cadastroCompleto === false,
    );
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
    if (
      event.key === "Enter" ||
      event.key === " " ||
      event.key === "Spacebar"
    ) {
      setPasswordModalOpen(true);
    }
  };

  function openView(nextView) {
    setOpenDashboardSection("");
    setView(nextView);
  }

  function renderDashboardItem(item) {
    if (typeof item === "string") {
      return <MenuItem key={item} title={item} />;
    }

    return (
      <MenuItem
        key={item.label}
        onAction={item.onAction}
        summary={item.description}
        title={item.label}
      />
    );
  }

  function renderAdminDashboardSections() {
    return (
      <MenuTemplate
        panels={[
          {
            id: "admin-home",
            title: "Painel Administrativo",
            summary: "Acesse os menus administrativos do sistema.",
            ariaLabel: "Menus administrativos",
            items: dashboardSections.map((section) => ({
              id: section.id,
              title: section.title,
              summary: section.summary,
              isOpen: openDashboardSection === section.id,
              onAction: () =>
                setOpenDashboardSection((current) =>
                  current === section.id ? "" : section.id,
                ),
              content: (
                <MenuList ariaLabel={section.title}>
                  {section.items.map(renderDashboardItem)}
                  {section.actionLabel ? (
                    <MenuItem
                      onAction={section.onAction}
                      title={section.actionLabel}
                    />
                  ) : null}
                </MenuList>
              ),
            })),
          },
        ]}
      />
    );
  }

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
              Olá,{" "}
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
              <span className="user-badge">
                {usuarioGrupo || "Administrador"}
              </span>
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
        <MenuTemplate>
          <MenuPanel>
            <p>Verificando fluxo obrigatório do usuário...</p>
          </MenuPanel>
        </MenuTemplate>
      ) : view === "home" ? (
        isAdmin ? (
          renderAdminDashboardSections()
        ) : (
          <MenuTemplate>
            {dashboardSections.map((section) => (
              <MenuPanel
                key={section.id}
                summary={section.summary}
                title={section.title}
              >
                <MenuList ariaLabel={section.title}>
                  {section.items.map(renderDashboardItem)}
                  {section.actionLabel ? (
                    <MenuItem
                      onAction={section.onAction}
                      title={section.actionLabel}
                    />
                  ) : null}
                </MenuList>
              </MenuPanel>
            ))}
          </MenuTemplate>
        )
      ) : view === "mel" ? (
        <MelPetHostel
          onBack={() => {
            if (isAdmin) {
              setMelComplianceGate(false);
              setMelPetRegistrationOnly(false);
            } else {
              setMelComplianceGate(melPetRegistrationOnly);
              setMelPetRegistrationOnly(false);
            }
            setMelInitialAdminMenu("");
            setMelUserMenu("");
            setView("home");
          }}
          clientProfile={clientProfileInitial}
          clientProfileReady={clientProfileStatus.loaded}
          clientProfilePending={clientProfileStatus.pendente}
          enforceContractGate={melComplianceGate}
          initialAdminMenu={melInitialAdminMenu}
          userMenu={melUserMenu}
          petRegistrationOnly={!isAdmin && melPetRegistrationOnly}
          contractPromptRequest={contractPromptRequest}
          onPetRegistered={() => {
            setMelPetRegistrationOnly(false);
            setMelComplianceGate(false);
          }}
        />
      ) : view === "admin-users" ? (
        <AdminUsersPage onBack={() => setView("home")} />
      ) : view === "client-profile" ? (
        <ClientProfilePage
          cliente={clientProfileInitial}
          loading={clientProfilePageLoading}
          error={clientProfilePageError}
          onBack={() => setView("home")}
          onReload={openClientProfilePage}
        />
      ) : view === "admin-groups" ? (
        <AdminGroupsPage onBack={() => setView("home")} />
      ) : view === "admin-user-maintenance" ? (
        <AdminUserMaintenancePage onBack={() => setView("home")} />
      ) : view === "mel-tutor-maintenance" ? (
        <MelPetTutorMaintenancePage onBack={() => setView("home")} />
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
        currentLabel="Senha provisória atual"
        closeOnBackdropClick={false}
        description="Detectamos que esta é sua primeira entrada no sistema. Altere sua senha para continuar. Fechar esta janela irá deslogar o usuário."
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
