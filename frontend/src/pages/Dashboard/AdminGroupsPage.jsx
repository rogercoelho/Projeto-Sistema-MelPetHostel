import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Modal } from "../../components";
import { useToast } from "../../components/Toast/ToastContext";
import api from "../../services/api";

function getGroupId(grupo) {
  return grupo?.id ?? grupo?.grupo_id ?? grupo?.Grupo_ID;
}

function getGroupName(grupo) {
  return grupo?.nome || grupo?.Nome_Grupo || grupo?.Grupo_Nome || "Grupo";
}

function getGroupAccessLabel(grupo) {
  return (grupo?.acesso || grupo?.Acesso) === "adm"
    ? "Acesso de Administrador"
    : "Acesso de Cliente";
}

function AdminGroupsPage({ onBack }) {
  const [grupoForm, setGrupoForm] = useState({ nome: "", acesso: "usuario" });
  const [grupos, setGrupos] = useState([]);
  const [groupSearchTerm, setGroupSearchTerm] = useState("");
  const [submittedGroupSearchTerm, setSubmittedGroupSearchTerm] = useState("");
  const [hasSearchedGroups, setHasSearchedGroups] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteWarningGroup, setDeleteWarningGroup] = useState(null);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState(null);
  const [deletingGroupId, setDeletingGroupId] = useState(null);
  const { showToast } = useToast();

  const loadGroups = useCallback(async function loadGroups() {
    setLoading(true);
    try {
      const groupsData = await api.get("/auth/groups");
      setGrupos(Array.isArray(groupsData) ? groupsData : []);
    } catch (error) {
      setGrupos([]);
      showToast(error.message || "Erro ao carregar grupos.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const filteredGroups = useMemo(() => {
    const search = submittedGroupSearchTerm.trim().toLowerCase();
    if (!hasSearchedGroups) return [];
    if (!search) return grupos;
    return grupos.filter((grupo) =>
      [grupo.nome, grupo.Nome_Grupo, grupo.Grupo_Nome, grupo.acesso, grupo.Acesso]
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

  function startDeleteGroup(grupo) {
    setDeleteWarningGroup(grupo);
  }

  function acknowledgeDeleteGroup(grupo) {
    const groupId = getGroupId(grupo);
    setDeleteWarningGroup(null);
    setConfirmDeleteGroupId(groupId);
  }

  function cancelDeleteGroup() {
    setDeleteWarningGroup(null);
    setConfirmDeleteGroupId(null);
  }

  async function deleteGroup(grupo) {
    const groupId = getGroupId(grupo);
    if (!groupId) {
      showToast("ID do grupo nao encontrado.", "error");
      return;
    }

    setDeletingGroupId(groupId);
    try {
      await api.delete(`/auth/groups/${groupId}`);
      setConfirmDeleteGroupId(null);
      showToast("Grupo excluido.", "success");
      await loadGroups();
    } catch (error) {
      showToast(error.message || "Erro ao excluir grupo.", "error");
    } finally {
      setDeletingGroupId(null);
    }
  }

  async function createGroup(event) {
    event.preventDefault();
    const nome = grupoForm.nome.trim();
    if (!nome) {
      showToast("Nome do grupo e obrigatorio.", "error");
      return;
    }

    setSaving(true);
    try {
      await api.post("/auth/groups", { nome, acesso: grupoForm.acesso });
      setGrupoForm({ nome: "", acesso: "usuario" });
      showToast("Grupo criado.", "success");
      await loadGroups();
    } catch (error) {
      showToast(error.message || "Erro ao criar grupo.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="admin-page admin-user-create-page admin-management-page">
      <form
        className="admin-page-panel admin-page-form admin-user-create-card admin-management-panel"
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
                value={grupoForm.acesso}
                onChange={(event) => updateGroupField("acesso", event.target.value)}
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
              className="melpet-clear-button" type="button"
              variant="outline"
              onClick={clearGroupSearch}
              disabled={loading && !hasSearchedGroups}
            >
              Limpar
            </Button>
          </div>
        </section>

        {hasSearchedGroups ? (
          <section className="admin-user-create-section admin-user-search-results-section admin-management-results-section">
            <div className="admin-user-section-title">
            <span>Resultado</span>
            <h3>Grupos encontrados</h3>
          </div>

          <div className="admin-user-search-results">
            {loading ? (
              <p>Carregando grupos...</p>
            ) : filteredGroups.length ? (
              filteredGroups.map((grupo) => {
                const groupId = getGroupId(grupo);
                const isConfirmingDelete = confirmDeleteGroupId === groupId;
                const isDeleting = deletingGroupId === groupId;

                return (
                  <article key={groupId || getGroupName(grupo)}>
                    <div className="admin-user-search-result-info">
                      <strong>{getGroupName(grupo)}</strong>
                      <span>{getGroupAccessLabel(grupo)}</span>
                    </div>

                    <div className="admin-user-search-result-actions">
                      {isConfirmingDelete ? (
                        <>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => deleteGroup(grupo)}
                            disabled={isDeleting}
                          >
                            {isDeleting ? "Excluindo..." : "Confirmar"}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={cancelDeleteGroup}
                            disabled={isDeleting}
                          >
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => startDeleteGroup(grupo)}
                          disabled={isDeleting}
                        >
                          Excluir
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })
            ) : (
              <p>Nenhum grupo encontrado.</p>
            )}
          </div>
          </section>
        ) : null}

        <Modal
          isOpen={Boolean(deleteWarningGroup)}
          onClose={cancelDeleteGroup}
          title="Atenção"
          closeOnBackdropClick={false}
          showCloseButton={false}
          containerStyle={{ width: "min(94%, 520px)" }}
        >
          <div className="admin-page-delete-modal">
            <p>
              Atenção, excluir um grupo irá excluir todos os usuarios vinculados
              a ele. Faça com muita cautela!
            </p>

            <div className="modal-actions">
              <Button
                type="button"
                variant="danger"
                onClick={() => acknowledgeDeleteGroup(deleteWarningGroup)}
              >
                OK
              </Button>
            </div>
          </div>
        </Modal>

        <div className="admin-user-create-footer melpet-back-actions">
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            className="melpet-back-button"
          >
            Voltar
          </Button>
        </div>
      </form>
    </main>
  );
}

export default AdminGroupsPage;
