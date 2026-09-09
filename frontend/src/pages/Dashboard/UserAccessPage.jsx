import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import api from "../../services/api";

function getUserId(user) {
  return user?.id ?? user?.usuarioId ?? user?.Usuario_ID;
}

function getUserAccess(user) {
  return String(user?.grupoAcesso || user?.Grupo_Acesso || user?.grupo?.acesso || user?.grupo?.Acesso || "").toLowerCase();
}

function UserAccessPage({ onBack }) {
  const { accessAsUser } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [accessing, setAccessing] = useState(false);

  useEffect(() => {
    let active = true;
    api.get("/auth/users")
      .then((data) => {
        if (!active) return;
        setUsers(Array.isArray(data) ? data.filter((user) => getUserAccess(user) !== "adm") : []);
      })
      .catch((error) => {
        if (active) showToast(error.message || "Erro ao carregar usuários.", "error");
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [showToast]);

  const selectedUser = useMemo(
    () => users.find((user) => String(getUserId(user)) === String(selectedId)),
    [selectedId, users],
  );

  async function handleAccess() {
    if (!selectedId) {
      showToast("Selecione um usuário.", "error");
      return;
    }
    setAccessing(true);
    const result = await accessAsUser(selectedId);
    setAccessing(false);
    if (!result.sucesso) showToast(result.mensagem, "error");
  }

  return (
    <main className="admin-page admin-user-access-page">
      <section className="admin-page-header">
        <span>Administração de Usuários</span>
        <h2>Acesso do Usuário</h2>
        <p>Entre temporariamente no ambiente de um cliente para acompanhar o uso do sistema.</p>
      </section>
      <section className="admin-page-panel admin-user-access-panel">
        <div className="admin-page-panel-title">
          <span>Seleção</span>
          <h3>Escolha o usuário</h3>
        </div>
        <label className="admin-user-access-field">
          <span>Usuário cadastrado</span>
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={loading || accessing}>
            <option value="">Selecione um usuário</option>
            {users.map((user) => (
              <option key={getUserId(user)} value={getUserId(user)}>
                {user.login || user.Usuario_Login || "Usuário"}{user.cliente?.nome ? ` - ${user.cliente.nome}` : ""}
              </option>
            ))}
          </select>
        </label>
        {selectedUser ? <div className="admin-user-access-selected"><strong>{selectedUser.login || selectedUser.Usuario_Login}</strong><span>{selectedUser.cliente?.nome || "Cliente"}</span></div> : null}
        <div className="admin-user-access-actions">
          <Button type="button" onClick={handleAccess} disabled={!selectedId || loading || accessing}>{accessing ? "Acessando..." : "Acessar"}</Button>
        </div>
      </section>
      <div className="admin-user-create-footer melpet-back-actions"><Button type="button" variant="outline" onClick={onBack} className="melpet-back-button">Voltar</Button></div>
    </main>
  );
}

export default UserAccessPage;