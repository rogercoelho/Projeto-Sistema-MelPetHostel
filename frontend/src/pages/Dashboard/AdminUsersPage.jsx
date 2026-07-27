import { useEffect, useState } from "react";
import { Button } from "../../components";
import api from "../../services/api";
import AdminPageShell from "./AdminPageShell";
import {
  EMPTY_USER_FORM,
  MODULES,
  getGroupLabel,
  getUserGroupLabel,
  getUserGroupValue,
} from "./adminManagementUtils";

function AdminUsersPage({ onBack }) {
  const [selectedModulo, setSelectedModulo] = useState("melpethostel");
  const [grupos, setGrupos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [usuarioForm, setUsuarioForm] = useState(EMPTY_USER_FORM);
  const [editingUser, setEditingUser] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

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
      setMessage({
        type: "erro",
        text: error.message || "Erro ao carregar usuarios.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(selectedModulo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModulo]);

  function resetForm() {
    setEditingUser(null);
    setUsuarioForm(EMPTY_USER_FORM);
  }

  function startEditUser(user) {
    setMessage(null);
    setConfirmDeleteId(null);
    setEditingUser(user);
    setUsuarioForm({
      login: user.login || "",
      grupo: getUserGroupValue(user, grupos),
      senha: "",
    });
  }

  async function saveUser(event) {
    event.preventDefault();
    const login = usuarioForm.login.trim();
    const grupo = usuarioForm.grupo;

    if (!login || !grupo) {
      setMessage({ type: "erro", text: "Login e grupo sao obrigatorios." });
      return;
    }

    if (!editingUser && !usuarioForm.senha) {
      setMessage({ type: "erro", text: "Senha provisoria e obrigatoria." });
      return;
    }

    try {
      if (editingUser) {
        await api.put(
          `/auth/users/${editingUser.id}?modulo=${encodeURIComponent(selectedModulo)}`,
          { login, grupo },
        );
        setMessage({ type: "sucesso", text: "Usuario atualizado." });
      } else {
        await api.post("/auth/users", {
          login,
          grupo,
          senhaProvisoria: usuarioForm.senha,
          modulo: selectedModulo,
        });
        setMessage({ type: "sucesso", text: "Usuario criado." });
      }

      resetForm();
      await loadData();
    } catch (error) {
      setMessage({
        type: "erro",
        text: error.message || "Erro ao salvar usuario.",
      });
    }
  }

  async function deleteUser(user) {
    try {
      await api.delete(
        `/auth/users/${user.id}?modulo=${encodeURIComponent(selectedModulo)}`,
      );
      setConfirmDeleteId(null);
      setMessage({ type: "sucesso", text: "Usuario excluido." });
      await loadData();
    } catch (error) {
      setMessage({
        type: "erro",
        text: error.message || "Erro ao excluir usuario.",
      });
    }
  }

  return (
    <AdminPageShell
      title="Criacao e edicao de usuarios"
      description="Crie novos logins, edite o grupo de acesso e exclua usuarios quando necessario."
      onBack={onBack}
    >
      <section className="admin-page-layout">
        <form className="admin-page-panel admin-page-form" onSubmit={saveUser}>
          <div className="admin-page-panel-title">
            <span>{editingUser ? "Editando" : "Novo acesso"}</span>
            <h3>{editingUser ? editingUser.login : "Criar usuario"}</h3>
          </div>

          <label>
            Modulo
            <select
              value={selectedModulo}
              onChange={(event) => {
                setSelectedModulo(event.target.value);
                resetForm();
              }}
            >
              {MODULES.map((modulo) => (
                <option key={modulo.value} value={modulo.value}>
                  {modulo.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Login
            <input
              type="text"
              value={usuarioForm.login}
              onChange={(event) =>
                setUsuarioForm((state) => ({
                  ...state,
                  login: event.target.value,
                }))
              }
              placeholder="Login do usuario"
            />
          </label>

          <label>
            Grupo
            <select
              value={usuarioForm.grupo}
              onChange={(event) =>
                setUsuarioForm((state) => ({
                  ...state,
                  grupo: event.target.value,
                }))
              }
            >
              <option value="">-- Selecionar Grupo --</option>
              {grupos.map((grupo) => (
                <option key={grupo.id || grupo.nome} value={grupo.id}>
                  {getGroupLabel(grupo)}
                </option>
              ))}
            </select>
          </label>

          {!editingUser ? (
            <label>
              Senha provisoria
              <input
                type="text"
                value={usuarioForm.senha}
                onChange={(event) =>
                  setUsuarioForm((state) => ({
                    ...state,
                    senha: event.target.value,
                  }))
                }
                placeholder="Senha provisoria"
              />
            </label>
          ) : null}

          <div className="admin-page-actions">
            {editingUser ? (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancelar edicao
              </Button>
            ) : null}
            <Button type="submit">
              {editingUser ? "Salvar alteracoes" : "Criar usuario"}
            </Button>
          </div>

          {message ? (
            <p className={`admin-page-message ${message.type}`}>{message.text}</p>
          ) : null}
        </form>

        <section className="admin-page-panel">
          <div className="admin-page-panel-title">
            <span>Usuarios</span>
            <h3>Lista de acessos</h3>
          </div>

          {loading ? (
            <p>Carregando...</p>
          ) : usuarios.length ? (
            <div className="admin-page-list">
              {usuarios.map((user) => (
                <article key={user.id || user.login}>
                  <div>
                    <strong>{user.login}</strong>
                    <span>{getUserGroupLabel(user, grupos)}</span>
                  </div>
                  <div className="admin-page-row-actions">
                    <Button type="button" size="sm" onClick={() => startEditUser(user)}>
                      Editar
                    </Button>
                    {confirmDeleteId === user.id ? (
                      <>
                        <Button type="button" variant="danger" size="sm" onClick={() => deleteUser(user)}>
                          Confirmar
                        </Button>
                        <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmDeleteId(null)}>
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDeleteId(user.id)}>
                        Excluir
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p>Nenhum usuario cadastrado.</p>
          )}
        </section>
      </section>
    </AdminPageShell>
  );
}

export default AdminUsersPage;

