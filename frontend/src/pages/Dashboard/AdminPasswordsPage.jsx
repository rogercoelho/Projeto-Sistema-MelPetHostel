import { useEffect, useState } from "react";
import { Button } from "../../components";
import api from "../../services/api";
import AdminPageShell from "./AdminPageShell";
import { MODULES, getUserGroupLabel } from "./adminManagementUtils";

function AdminPasswordsPage({ onBack }) {
  const [selectedModulo, setSelectedModulo] = useState("melpethostel");
  const [grupos, setGrupos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
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
    setSelectedUser(null);
    setNovaSenha("");
    setConfirmarSenha("");
    loadData(selectedModulo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModulo]);

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
      await api.put(
        `/auth/users/${selectedUser.id}/password?modulo=${encodeURIComponent(selectedModulo)}`,
        { novaSenha },
      );
      setNovaSenha("");
      setConfirmarSenha("");
      setMessage({ type: "sucesso", text: "Senha alterada." });
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
      description="Selecione um usuario e redefina a senha diretamente na pagina."
      onBack={onBack}
    >
      <section className="admin-page-layout">
        <section className="admin-page-panel">
          <div className="admin-page-panel-title">
            <span>Usuarios</span>
            <h3>Selecionar acesso</h3>
          </div>

          <label className="admin-page-form-field">
            Modulo
            <select value={selectedModulo} onChange={(event) => setSelectedModulo(event.target.value)}>
              {MODULES.map((modulo) => (
                <option key={modulo.value} value={modulo.value}>
                  {modulo.label}
                </option>
              ))}
            </select>
          </label>

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
                  </div>
                  <Button type="button" size="sm" onClick={() => setSelectedUser(user)}>
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

          <Button type="submit" disabled={!selectedUser}>
            Alterar senha
          </Button>

          {message ? (
            <p className={`admin-page-message ${message.type}`}>{message.text}</p>
          ) : null}
        </form>
      </section>
    </AdminPageShell>
  );
}

export default AdminPasswordsPage;

