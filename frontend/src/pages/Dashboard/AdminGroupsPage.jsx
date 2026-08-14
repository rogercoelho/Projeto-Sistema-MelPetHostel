import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components";
import api from "../../services/api";

function AdminGroupsPage({ onBack }) {
  const [grupoForm, setGrupoForm] = useState({ nome: "", tela: "usuario" });
  const [grupos, setGrupos] = useState([]);
  const [groupSearchTerm, setGroupSearchTerm] = useState("");
  const [submittedGroupSearchTerm, setSubmittedGroupSearchTerm] = useState("");
  const [hasSearchedGroups, setHasSearchedGroups] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  async function loadGroups() {
    setLoading(true);
    try {
      const groupsData = await api.get("/auth/groups");
      setGrupos(Array.isArray(groupsData) ? groupsData : []);
    } catch (error) {
      setGrupos([]);
      setMessage({ type: "erro", text: error.message || "Erro ao carregar grupos." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGroups();
  }, []);

  const filteredGroups = useMemo(() => {
    const search = submittedGroupSearchTerm.trim().toLowerCase();
    if (!hasSearchedGroups) return [];
    if (!search) return grupos;
    return grupos.filter((grupo) =>
      [grupo.nome, grupo.Grupo_Nome, grupo.tela]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search)),
    );
  }, [grupos, hasSearchedGroups, submittedGroupSearchTerm]);

  function searchGroups() {
    setSubmittedGroupSearchTerm(groupSearchTerm);
    setHasSearchedGroups(true);
  }

  function handleGroupSearchKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      searchGroups();
    }
  }

  function clearGroupSearch() {
    setGroupSearchTerm("");
    setSubmittedGroupSearchTerm("");
    setHasSearchedGroups(false);
  }

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
      await loadGroups();
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
              Vincular ao Acesso
              <select
                value={grupoForm.tela}
                onChange={(event) => updateGroupField("tela", event.target.value)}
              >
                <option value="adm">Acesso de Administrador</option>
                <option value="usuario">Acesso de Cliente</option>
              </select>
            </label>
          </div>

          <div className="admin-page-actions admin-user-create-actions">
            <Button type="submit" disabled={saving}>
              {saving ? "Criando..." : "Criar grupo"}
            </Button>
          </div>
        </section>

        <section className="admin-user-create-section admin-user-search-section">
          <div className="admin-user-section-title">
            <span>Pesquisa</span>
            <h3>Pesquisar grupos</h3>
          </div>

          <label className="admin-user-search-field">
            Buscar grupo
            <input
              type="search"
              value={groupSearchTerm}
              onChange={(event) => setGroupSearchTerm(event.target.value)}
              onKeyDown={handleGroupSearchKeyDown}
              placeholder="Nome ou acesso vinculado"
            />
          </label>

          <div className="admin-page-actions admin-user-search-actions">
            <Button type="button" onClick={searchGroups} disabled={loading}>
              Pesquisar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={clearGroupSearch}
              disabled={loading && !hasSearchedGroups}
            >
              Limpar
            </Button>
          </div>
        </section>

        {hasSearchedGroups ? (
          <section className="admin-user-create-section admin-user-search-results-section">
            <div className="admin-user-section-title">
            <span>Resultado</span>
            <h3>Grupos encontrados</h3>
          </div>

          <div className="admin-user-search-results">
            {loading ? (
              <p>Carregando grupos...</p>
            ) : filteredGroups.length ? (
              filteredGroups.map((grupo) => (
                <article key={grupo.id || grupo.nome}>
                  <strong>{grupo.nome || grupo.Grupo_Nome}</strong>
                  <span>{grupo.tela === "adm" ? "Acesso de Administrador" : "Acesso de Cliente"}</span>
                </article>
              ))
            ) : (
              <p>Nenhum grupo encontrado.</p>
            )}
          </div>
          </section>
        ) : null}

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
