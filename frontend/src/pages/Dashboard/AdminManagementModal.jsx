import { useEffect, useState } from "react";
import { Alert, Button, Input, Modal } from "../../components";
import { useToast } from "../../components/Toast/ToastContext";
import api from "../../services/api";
import { userBelongsToGroup } from "./utils";

const MODULES = [
  { value: "melpethostel", label: "Mel Pet Hostel" },
  { value: "administradores", label: "Administradores" },
];

function TrashIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ verticalAlign: "middle" }}
    >
      <path
        d="M3 6h18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UserPasswordEditor({ user, modulo, onDone }) {
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  async function handleSubmit(event) {
    event.preventDefault();
    if (!novaSenha || novaSenha.length < 6) {
      showToast("Senha deve ter ao menos 6 caracteres", "error");
      return;
    }
    if (novaSenha !== confirmarSenha) {
      showToast("As senhas nao coincidem", "error");
      return;
    }

    setLoading(true);
    try {
      await api.put(
        `/auth/users/${user.id}/password?modulo=${encodeURIComponent(modulo)}`,
        { novaSenha },
      );
      showToast("Senha alterada.", "success");
      setNovaSenha("");
      setConfirmarSenha("");
      onDone();
    } catch (error) {
      showToast(error.message || "Erro ao alterar senha.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form-senha" onSubmit={handleSubmit}>
      <Input
        label="Nova senha"
        type="password"
        name={`novaSenha-${user.id}`}
        value={novaSenha}
        onChange={(event) => setNovaSenha(event.target.value)}
        placeholder="Nova senha"
        required
      />
      <Input
        label="Confirmar senha"
        type="password"
        name={`confirmarSenha-${user.id}`}
        value={confirmarSenha}
        onChange={(event) => setConfirmarSenha(event.target.value)}
        placeholder="Confirmar senha"
        required
      />
      <Button type="submit" disabled={loading}>
        {loading ? "Alterando..." : "Alterar"}
      </Button>
    </form>
  );
}

export default function AdminManagementModal({ isOpen, onClose }) {
  const { showToast } = useToast();
  const [selectedModulo, setSelectedModulo] = useState("melpethostel");
  const [grupos, setGrupos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [novoGrupoNome, setNovoGrupoNome] = useState("");
  const [novoUsuario, setNovoUsuario] = useState({
    login: "",
    grupo: "",
    senha: "",
  });
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [alert, setAlert] = useState(null);

  async function loadData(modulo = selectedModulo) {
    setLoading(true);
    try {
      const [groupsData, usersData] = await Promise.all([
        api.get(`/auth/groups?modulo=${encodeURIComponent(modulo)}`),
        api.get(`/auth/users?modulo=${encodeURIComponent(modulo)}`),
      ]);
      setGrupos(Array.isArray(groupsData) ? groupsData : []);
      setUsuarios(Array.isArray(usersData) ? usersData : []);
    } catch (error) {
      setGrupos([]);
      setUsuarios([]);
      showToast(error.message || "Erro ao carregar administracao", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen) loadData(selectedModulo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedModulo]);

  function handleModuloChange(event) {
    setSelectedModulo(event.target.value);
    setNovoUsuario({ login: "", grupo: "", senha: "" });
    setNovoGrupoNome("");
    setSelectedUser(null);
  }

  async function criarGrupo(event) {
    event.preventDefault();
    const nome = novoGrupoNome.trim();
    if (!nome) return;

    try {
      await api.post("/auth/groups", { nome, modulo: selectedModulo });
      setNovoGrupoNome("");
      await loadData();
      showToast("Grupo criado.", "success");
    } catch (error) {
      setAlert({
        title: "Erro ao criar grupo",
        message: error.message || "Erro ao criar grupo.",
      });
    }
  }

  async function criarUsuario(event) {
    event.preventDefault();
    if (!novoUsuario.login || !novoUsuario.senha || !novoUsuario.grupo) {
      showToast("Login, grupo e senha provisoria sao obrigatorios", "error");
      return;
    }

    try {
      await api.post("/auth/users", {
        login: novoUsuario.login.trim(),
        grupo: novoUsuario.grupo,
        senhaProvisoria: novoUsuario.senha,
        modulo: selectedModulo,
      });
      setNovoUsuario({ login: "", grupo: "", senha: "" });
      await loadData();
      showToast("Usuario criado.", "success");
    } catch (error) {
      setAlert({
        title: "Erro ao criar usuario",
        message: error.message || "Erro ao criar usuario.",
      });
    }
  }

  async function deleteGroup(group) {
    await api.delete(
      `/auth/groups/${group.id}?modulo=${encodeURIComponent(selectedModulo)}`,
    );
    showToast("Grupo excluido.", "success");
    await loadData();
  }

  async function deleteUser(user) {
    await api.delete(
      `/auth/users/${user.id}?modulo=${encodeURIComponent(selectedModulo)}`,
    );
    showToast("Usuario excluido.", "success");
    await loadData();
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Gerenciar Grupos e Usuarios"
        containerStyle={{
          width: "min(95%,720px)",
          maxWidth: 720,
          backgroundColor: "var(--cor-areia)",
          padding: 12,
          borderRadius: 8,
        }}
        contentStyle={{ padding: 12 }}
      >
        <div className="groups-modal">
          <div className="groups-modal-grid">
            <div className="groups-modal-col">
              <label className="create-category-form-label">
                Modulo
                <select
                  value={selectedModulo}
                  onChange={handleModuloChange}
                  style={{ width: "100%", padding: 8, marginTop: 8 }}
                >
                  {MODULES.map((modulo) => (
                    <option key={modulo.value} value={modulo.value}>
                      {modulo.label}
                    </option>
                  ))}
                </select>
              </label>

              <h4 style={{ margin: "12px 0 8px 0" }}>Criar Grupo</h4>
              <form onSubmit={criarGrupo}>
                <input
                  type="text"
                  value={novoGrupoNome}
                  onChange={(event) => setNovoGrupoNome(event.target.value)}
                  placeholder="Nome do grupo"
                  disabled={selectedModulo === "administradores"}
                  style={{ width: "100%", padding: 8, marginBottom: 8 }}
                />
                {selectedModulo === "administradores" ? (
                  <p style={{ margin: "0 0 8px 0", fontSize: 12 }}>
                    Administradores usam o grupo padrao Administradores.
                  </p>
                ) : null}
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    type="button"
                    variant="secondary"
                    className="btn-black-outline"
                    onClick={onClose}
                  >
                    Fechar
                  </Button>
                  <Button
                    type="submit"
                    disabled={selectedModulo === "administradores"}
                  >
                    Criar Grupo
                  </Button>
                </div>
              </form>
            </div>

            <div className="groups-modal-col">
              <h4 style={{ margin: "0 0 8px 0" }}>Criar Usuario</h4>
              <form onSubmit={criarUsuario}>
                <input
                  type="text"
                  value={novoUsuario.login}
                  onChange={(event) =>
                    setNovoUsuario((state) => ({
                      ...state,
                      login: event.target.value,
                    }))
                  }
                  placeholder="Login"
                  style={{ width: "100%", padding: 8, marginBottom: 8 }}
                />
                <select
                  value={novoUsuario.grupo}
                  onChange={(event) =>
                    setNovoUsuario((state) => ({
                      ...state,
                      grupo: event.target.value,
                    }))
                  }
                  required
                  style={{ width: "100%", padding: 8, marginBottom: 8 }}
                >
                  <option value="">-- Selecionar Grupo --</option>
                  {grupos.map((grupo) => (
                    <option key={grupo.id || grupo.nome} value={grupo.id}>
                      {grupo.nome || grupo.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={novoUsuario.senha}
                  onChange={(event) =>
                    setNovoUsuario((state) => ({
                      ...state,
                      senha: event.target.value,
                    }))
                  }
                  placeholder="Senha provisoria"
                  style={{ width: "100%", padding: 8, marginBottom: 8 }}
                />
                <Button type="submit">Criar Usuario</Button>
              </form>
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <h3 style={{ margin: "0 0 8px 0" }}>
              Grupos existentes (usuarios)
            </h3>
            {loading ? (
              <p>Carregando...</p>
            ) : grupos.length ? (
              <div>
                {grupos.map((grupo) => (
                  <div key={grupo.id || grupo.nome} style={{ marginBottom: 8 }}>
                    <strong>{grupo.nome || grupo.name}</strong>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setConfirm({
                          title: "Excluir grupo",
                          message:
                            "Remover o grupo tambem remove usuarios e pastas vinculadas. Esta acao e irreversivel.",
                          action: () => deleteGroup(grupo),
                        })
                      }
                      style={{
                        marginLeft: 8,
                        borderColor: "#cc4444",
                        color: "#cc4444",
                        height: 32,
                        padding: "4px 8px",
                      }}
                    >
                      <TrashIcon /> Excluir
                    </Button>
                    <div style={{ marginLeft: 8 }}>
                      <ul>
                        {usuarios
                          .filter((usuario) => userBelongsToGroup(usuario, grupo))
                          .map((usuario) => (
                            <li key={usuario.id || usuario.login}>
                              {usuario.login}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedUser(usuario)}
                                style={{ marginLeft: 8, height: 32 }}
                              >
                                Editar
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setConfirm({
                                    title: "Excluir usuario",
                                    message: `Confirma exclusao do usuario "${usuario.login}"?`,
                                    action: () => deleteUser(usuario),
                                  })
                                }
                                style={{
                                  marginLeft: 8,
                                  borderColor: "#cc4444",
                                  color: "#cc4444",
                                  height: 32,
                                  padding: "4px 8px",
                                }}
                              >
                                <TrashIcon /> Excluir
                              </Button>
                            </li>
                          ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>Nenhum grupo cadastrado.</p>
            )}
          </div>

          {selectedUser ? (
            <div style={{ marginTop: 12 }}>
              <h4>Alterar senha de: {selectedUser.login}</h4>
              <UserPasswordEditor
                user={selectedUser}
                modulo={selectedModulo}
                onDone={() => {
                  setSelectedUser(null);
                  loadData();
                }}
              />
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.title || "Confirmacao"}
      >
        <p style={{ margin: 0, marginBottom: 16 }}>
          {confirm?.message || ""}
        </p>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={() => setConfirm(null)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={async () => {
              try {
                await confirm.action();
              } catch (error) {
                setAlert({
                  title: confirm.title,
                  message: error.message || "Erro ao executar acao.",
                });
              } finally {
                setConfirm(null);
              }
            }}
          >
            Confirmar
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(alert)}
        onClose={() => setAlert(null)}
        title={alert?.title || "Aviso"}
      >
        <Alert type="error">{alert?.message || ""}</Alert>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={() => setAlert(null)}>
            Fechar
          </Button>
        </div>
      </Modal>
    </>
  );
}
