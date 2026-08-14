import { useState } from "react";
import { Button } from "../../components";
import api from "../../services/api";

function AdminGroupsPage({ onBack }) {
  const [grupoForm, setGrupoForm] = useState({ nome: "", tela: "usuario" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  function updateGroupField(field, value) {
    setGrupoForm((state) => ({ ...state, [field]: value }));
  }

  async function createGroup(event) {
    event.preventDefault();
    const nome = grupoForm.nome.trim();
    if (!nome) {
      setMessage({ type: "erro", text: "Nome do grupo e obrigatorio." });
      return;
    }

    setSaving(true);
    try {
      await api.post("/auth/groups", { nome, tela: grupoForm.tela });
      setGrupoForm({ nome: "", tela: "usuario" });
      setMessage({ type: "sucesso", text: "Grupo criado." });
    } catch (error) {
      setMessage({
        type: "erro",
        text: error.message || "Erro ao criar grupo.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="admin-page admin-user-create-page">
      <form
        className="admin-page-panel admin-page-form admin-user-create-card"
        onSubmit={createGroup}
      >
        <header className="admin-user-create-header">
          <div className="admin-user-create-heading">
            <span>Administração de Usuários</span>
            <h2>Criar grupo</h2>
          </div>
          <p className="admin-user-create-subtitle">
            Cadastre um grupo e defina se ele pertence ao fluxo administrativo
            ou ao fluxo do usuário.
          </p>
        </header>

        <section className="admin-user-create-section admin-group-create-section">
          <div className="admin-user-section-title">
            <span>Grupo</span>
            <h3>Dados do grupo</h3>
          </div>

          <div className="admin-user-create-grid admin-group-create-grid">
            <label>
              Nome do grupo
              <input
                type="text"
                value={grupoForm.nome}
                onChange={(event) => updateGroupField("nome", event.target.value)}
                placeholder="Nome do grupo"
              />
            </label>

            <label>
              Vincular à tela
              <select
                value={grupoForm.tela}
                onChange={(event) => updateGroupField("tela", event.target.value)}
              >
                <option value="adm">Tela de adm</option>
                <option value="usuario">Tela de usuário</option>
              </select>
            </label>
          </div>

          <div className="admin-page-actions admin-user-create-actions">
            <Button type="submit" disabled={saving}>
              {saving ? "Criando..." : "Criar grupo"}
            </Button>
          </div>
        </section>

        <div className="admin-user-create-footer">
          <Button type="button" variant="outline" onClick={onBack}>
            Voltar
          </Button>
        </div>

        {message ? (
          <p className={["admin-page-message", message.type].filter(Boolean).join(" ")}>
            {message.text}
          </p>
        ) : null}
      </form>
    </main>
  );
}

export default AdminGroupsPage;
