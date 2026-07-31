import { useEffect, useState } from "react";
import { Button } from "../../components";
import api from "../../services/api";
import AdminPageShell from "./AdminPageShell";
import { getUserGroupLabel } from "./adminManagementUtils";

function AdminPasswordsPage({ onBack }) {
  const [grupos, setGrupos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [primeiroAcesso, setPrimeiroAcesso] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  async function loadData() {
    setLoading(true);
    try {
      const [groupsData, usersData] = await Promise.all([
        api.get("/auth/groups"),
        api.get("/auth/users"),
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
    loadData();
  }, []);

  function selectUser(user) {
    setSelectedUser(user);
    setNovaSenha("");
    setConfirmarSenha("");
    setPrimeiroAcesso(Boolean(user.primeiroAcesso));
    setMessage(null);
  }

  async function savePassword(event) {
    event.preventDefault();
    if (!selectedUser) {
      setMessage({ type: "erro", text: "Selecione um usuario." });
      return;
    }
    if (!novaSenha || novaSenha.length < 6) {
      setMessage({
        type: "erro",
        text: "Senha deve ter ao menos 6 caracteres.",
      });
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setMessage({ type: "erro", text: "As senhas nao coincidem." });
      return;
    }

    try {
      await api.put(`/auth/users/${selectedUser.id}/password`, {
        novaSenha,
        primeiroAcesso,
      });
      setNovaSenha("");
      setConfirmarSenha("");
      setSelectedUser((state) =>
        state ? { ...state, primeiroAcesso } : state,
      );
      setMessage({ type: "sucesso", text: "Senha alterada." });
      await loadData();
    } catch (error) {
      setMessage({
        type: "erro",
        text: error.message || "Erro ao alterar senha.",
      });
    }
  }

  return (
    <AdminPageShell
      title="Alteracao de senha administrativa"
      description="Selecione um usuario, redefina a senha e informe se o proximo login sera primeiro acesso."
      onBack={onBack}
    >
      <section className="admin-page-layout">
        <section className="admin-page-panel">
          <div className="admin-page-panel-title">
            <span>Usuarios</span>
            <h3>Selecionar acesso</h3>
          </div>

          {loading ? (
            <p>Carregando...</p>
          ) : usuarios.length ? (
            <div className="admin-page-list">
              {usuarios.map((user) => (
                <article
                  className={selectedUser?.id === user.id ? "is-selected" : ""}
                  key={user.id || user.login}
                >
                  <div>
                    <strong>{user.login}</strong>
                    <span>{getUserGroupLabel(user, grupos)}</span>
                    <span>
                      Primeiro acesso: {user.primeiroAcesso ? "Sim" : "Nao"}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => selectUser(user)}
                  >
                    Selecionar
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <p>Nenhum usuario cadastrado.</p>
          )}
        </section>

        <form className="admin-page-panel admin-page-form" onSubmit={savePassword}>
          <div className="admin-page-panel-title">
            <span>Senha</span>
            <h3>{selectedUser ? selectedUser.login : "Nenhum usuario selecionado"}</h3>
          </div>

          <label>
            Nova senha
            <input
              type="password"
              value={novaSenha}
              onChange={(event) => setNovaSenha(event.target.value)}
              placeholder="Nova senha"
            />
          </label>

          <label>
            Confirmar senha
            <input
              type="password"
              value={confirmarSenha}
              onChange={(event) => setConfirmarSenha(event.target.value)}
              placeholder="Confirmar senha"
            />
          </label>

          <label className="admin-page-checkbox">
            <input
              type="checkbox"
              checked={primeiroAcesso}
              onChange={(event) => setPrimeiroAcesso(event.target.checked)}
              disabled={!selectedUser}
            />
            Marcar como primeiro acesso
          </label>

          <Button type="submit" disabled={!selectedUser}>
            Alterar senha
          </Button>

          {message ? (
            <p className={`admin-page-message ${message.type}`}>
              {message.text}
            </p>
          ) : null}
        </form>
      </section>
    </AdminPageShell>
  );
}

export default AdminPasswordsPage;
