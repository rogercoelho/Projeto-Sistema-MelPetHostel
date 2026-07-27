import { useEffect, useState } from "react";
import { Button } from "../../components";
import api from "../../services/api";
import AdminPageShell from "./AdminPageShell";
import { userBelongsToGroup } from "./utils";
import {
  MODULES,
  getGroupLabel,
  getUserGroupLabel,
  getUserGroupValue,
} from "./adminManagementUtils";

function AdminGroupsPage({ onBack }) {
  const [selectedModulo, setSelectedModulo] = useState("melpethostel");
  const [grupos, setGrupos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [novoGrupoNome, setNovoGrupoNome] = useState("");
  const [userGroupDrafts, setUserGroupDrafts] = useState({});
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
      const nextGroups = Array.isArray(groupsData) ? groupsData : [];
      const nextUsers = Array.isArray(usersData) ? usersData : [];
      setGrupos(nextGroups);
      setUsuarios(nextUsers);
      setUserGroupDrafts(
        nextUsers.reduce((acc, user) => {
          acc[user.id] = getUserGroupValue(user, nextGroups);
          return acc;
        }, {}),
      );
    } catch (error) {
      setGrupos([]);
      setUsuarios([]);
      setMessage({
        type: "erro",
        text: error.message || "Erro ao carregar grupos.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(selectedModulo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModulo]);

  async function createGroup(event) {
    event.preventDefault();
    const nome = novoGrupoNome.trim();
    if (!nome) return;

    try {
      await api.post("/auth/groups", { nome, modulo: selectedModulo });
      setNovoGrupoNome("");
      setMessage({ type: "sucesso", text: "Grupo criado." });
      await loadData();
    } catch (error) {
      setMessage({
        type: "erro",
        text: error.message || "Erro ao criar grupo.",
      });
    }
  }

  async function deleteGroup(group) {
    try {
      await api.delete(
        `/auth/groups/${group.id}?modulo=${encodeURIComponent(selectedModulo)}`,
      );
      setConfirmDeleteId(null);
      setMessage({ type: "sucesso", text: "Grupo excluido." });
      await loadData();
    } catch (error) {
      setMessage({
        type: "erro",
        text: error.message || "Erro ao excluir grupo.",
      });
    }
  }

  async function saveUserGroup(user) {
    const grupo = userGroupDrafts[user.id];
    if (!grupo) {
      setMessage({ type: "erro", text: "Selecione um grupo para o usuario." });
      return;
    }

    try {
      await api.put(
        `/auth/users/${user.id}?modulo=${encodeURIComponent(selectedModulo)}`,
        { login: user.login, grupo },
      );
      setMessage({ type: "sucesso", text: "Vinculo atualizado." });
      await loadData();
    } catch (error) {
      setMessage({
        type: "erro",
        text: error.message || "Erro ao atualizar vinculo.",
      });
    }
  }

  return (
    <AdminPageShell
      title="Vinculo de grupos e permissoes"
      description="Crie grupos, confira usuarios vinculados e altere o grupo de cada usuario sem abrir modal."
      onBack={onBack}
    >
      <section className="admin-page-layout">
        <section className="admin-page-panel">
          <div className="admin-page-panel-title">
            <span>Grupos</span>
            <h3>Criar e acompanhar</h3>
          </div>

          <label className="admin-page-form-field">
            Modulo
            <select
              value={selectedModulo}
              onChange={(event) => {
                setSelectedModulo(event.target.value);
                setNovoGrupoNome("");
              }}
            >
              {MODULES.map((modulo) => (
                <option key={modulo.value} value={modulo.value}>
                  {modulo.label}
                </option>
              ))}
            </select>
          </label>

          <form className="admin-page-form compact" onSubmit={createGroup}>
            <label>
              Novo grupo
              <input
                type="text"
                value={novoGrupoNome}
                onChange={(event) => setNovoGrupoNome(event.target.value)}
                placeholder="Nome do grupo"
                disabled={selectedModulo === "administradores"}
              />
            </label>
            {selectedModulo === "administradores" ? (
              <p>Administradores usam o grupo padrao Administradores.</p>
            ) : null}
            <Button type="submit" disabled={selectedModulo === "administradores"}>
              Criar grupo
            </Button>
          </form>

          {message ? (
            <p className={`admin-page-message ${message.type}`}>{message.text}</p>
          ) : null}

          {loading ? (
            <p>Carregando...</p>
          ) : grupos.length ? (
            <div className="admin-page-list">
              {grupos.map((grupo) => {
                const linkedUsers = usuarios.filter((user) =>
                  userBelongsToGroup(user, grupo),
                );

                return (
                  <article key={grupo.id || grupo.nome}>
                    <div>
                      <strong>{getGroupLabel(grupo)}</strong>
                      <span>{linkedUsers.length} usuario(s) vinculado(s)</span>
                    </div>
                    {selectedModulo !== "administradores" ? (
                      <div className="admin-page-row-actions">
                        {confirmDeleteId === grupo.id ? (
                          <>
                            <Button type="button" variant="danger" size="sm" onClick={() => deleteGroup(grupo)}>
                              Confirmar
                            </Button>
                            <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmDeleteId(null)}>
                              Cancelar
                            </Button>
                          </>
                        ) : (
                          <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDeleteId(grupo.id)}>
                            Excluir
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <p>Nenhum grupo cadastrado.</p>
          )}
        </section>

        <section className="admin-page-panel">
          <div className="admin-page-panel-title">
            <span>Permissoes</span>
            <h3>Vincular usuarios</h3>
          </div>

          {usuarios.length ? (
            <div className="admin-page-list">
              {usuarios.map((user) => (
                <article key={user.id || user.login}>
                  <div>
                    <strong>{user.login}</strong>
                    <span>Atual: {getUserGroupLabel(user, grupos)}</span>
                  </div>
                  <div className="admin-page-row-actions inline-select">
                    <select
                      value={userGroupDrafts[user.id] || ""}
                      onChange={(event) =>
                        setUserGroupDrafts((state) => ({
                          ...state,
                          [user.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">-- Grupo --</option>
                      {grupos.map((grupo) => (
                        <option key={grupo.id || grupo.nome} value={grupo.id}>
                          {getGroupLabel(grupo)}
                        </option>
                      ))}
                    </select>
                    <Button type="button" size="sm" onClick={() => saveUserGroup(user)}>
                      Salvar
                    </Button>
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

export default AdminGroupsPage;

