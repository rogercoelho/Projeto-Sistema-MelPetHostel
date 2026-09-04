import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Modal } from "../../components";
import { useToast } from "../../components/Toast/ToastContext";
import api from "../../services/api";
import {
  buildAddressesPayload,
  createAddressList,
} from "../../utils/addressFields";
import {
  applyClientFieldMask,
  cpfDigits,
  maskBrazilPhone,
  maskCpf,
  maskRg,
} from "../../utils/brFields";
import { getClientProfileValidationMessage } from "../../utils/clientProfile";
import {
  EMPTY_CLIENT_FORM,
  findGroupByValue,
  getGroupLabel,
  getUserGroupLabel,
  getUserGroupValue,
  isAdminAccessGroup,
} from "./adminManagementUtils";
import AddressFields from "./AddressFields";

function normalizeDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function buildClientForm(cliente = {}, user = {}) {
  return {
    ...EMPTY_CLIENT_FORM,
    ...cliente,
    nome: cliente.nome || user.cliente_nome || "",
    cpf: maskCpf(cliente.cpf || user.cliente_cpf || ""),
    rg: maskRg(cliente.rg || user.cliente_rg || ""),
    data_nascimento: normalizeDate(
      cliente.data_nascimento || user.cliente_data_nascimento,
    ),
    telefone: maskBrazilPhone(cliente.telefone || user.cliente_telefone || ""),
    whatsapp: maskBrazilPhone(cliente.whatsapp || user.cliente_whatsapp || ""),
    email: cliente.email || user.cliente_email || "",
    observacoes: cliente.observacoes || user.cliente_observacoes || "",
    ativo:
      cliente.ativo === undefined || cliente.ativo === null
        ? true
        : Boolean(cliente.ativo),
    enderecos: createAddressList(cliente.enderecos || user.enderecos || []),
  };
}

function buildSelectedUserForm(user, grupos) {
  return {
    login: user?.login || user?.Usuario_Login || "",
    grupo: getUserGroupValue(user, grupos),
    ativo:
      user?.ativo === undefined || user?.ativo === null
        ? true
        : Boolean(user.ativo),
    cliente: buildClientForm(user?.cliente, user),
  };
}

function hasClienteData(cliente) {
  if (!cliente) return false;
  return [
    cliente.nome,
    cliente.cpf,
    cliente.rg,
    cliente.data_nascimento,
    cliente.telefone,
    cliente.whatsapp,
    cliente.email,
    cliente.observacoes,
  ].some(Boolean) || Boolean(cliente.enderecos?.length);
}

function AdminUserMaintenancePage({ onBack }) {
  const [grupos, setGrupos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [submittedUserSearchTerm, setSubmittedUserSearchTerm] = useState("");
  const [hasSearchedUsers, setHasSearchedUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userForm, setUserForm] = useState(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [primeiroAcesso, setPrimeiroAcesso] = useState(false);
  const [deleteWarningUser, setDeleteWarningUser] = useState(null);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const { showToast } = useToast();

  const selectedGroup = useMemo(
    () => findGroupByValue(userForm?.grupo, grupos),
    [grupos, userForm?.grupo],
  );
  const shouldShowClienteFields = isAdminAccessGroup(selectedGroup);
  const selectedCliente = userForm?.cliente || null;
  const shouldEditClienteFields = shouldShowClienteFields || hasClienteData(selectedCliente);

  const loadData = useCallback(async function loadData() {
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
      showToast(error.message || "Erro ao carregar usuarios.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredUsers = useMemo(() => {
    const search = submittedUserSearchTerm.trim().toLowerCase();
    if (!hasSearchedUsers) return [];
    if (!search) return usuarios;
    return usuarios.filter((user) =>
      [
        user.login,
        user.Usuario_Login,
        user.grupoNome,
        user.Grupo_Nome,
        user.cliente?.nome,
        user.cliente_nome,
        user.cliente?.cpf,
        user.cliente_cpf,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search)),
    );
  }, [hasSearchedUsers, usuarios, submittedUserSearchTerm]);

  function searchUsers() {
    setSubmittedUserSearchTerm(userSearchTerm);
    setHasSearchedUsers(true);
    setSelectedUser(null);
    setUserForm(null);
  }

  function handleUserSearchKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      searchUsers();
    }
  }

  function clearUserSearch() {
    setUserSearchTerm("");
    setSubmittedUserSearchTerm("");
    setHasSearchedUsers(false);
    setSelectedUser(null);
    setUserForm(null);
  }

  function selectUser(user) {
    setSelectedUser(user);
    setUserForm(buildSelectedUserForm(user, grupos));
    setNovaSenha("");
    setConfirmarSenha("");
    setPrimeiroAcesso(Boolean(user.primeiroAcesso));
    setConfirmDeleteUserId(null);
  }

  function updateUserField(field, value) {
    setUserForm((state) => ({ ...state, [field]: value }));
  }

  function updateClienteField(field, value) {
    setUserForm((state) => ({
      ...state,
      cliente: { ...state.cliente, [field]: value },
    }));
  }

  function updateClienteAddresses(enderecos) {
    setUserForm((state) => ({
      ...state,
      cliente: { ...state.cliente, enderecos },
    }));
  }

  function updateMaskedClienteField(field, event) {
    updateClienteField(field, applyClientFieldMask(field, event));
  }

  function buildClientePayload() {
    return {
      ...userForm.cliente,
      nome: userForm.cliente.nome.trim(),
      cpf: cpfDigits(userForm.cliente.cpf),
      rg: userForm.cliente.rg.trim(),
      telefone: userForm.cliente.telefone.trim(),
      whatsapp: userForm.cliente.whatsapp.trim(),
      email: userForm.cliente.email.trim(),
      observacoes: userForm.cliente.observacoes.trim(),
      enderecos: buildAddressesPayload(userForm.cliente.enderecos),
    };
  }

  async function saveUser(event, { includeCliente = false } = {}) {
    event.preventDefault();
    if (!selectedUser || !userForm) {
      showToast("Selecione um usuario.", "error");
      return;
    }

    const login = userForm.login.trim();
    if (!login || !userForm.grupo) {
      showToast("Login e grupo sao obrigatorios.", "error");
      return;
    }

    if (includeCliente && shouldEditClienteFields) {
      const validationMessage = getClientProfileValidationMessage(
        userForm.cliente,
      );
      if (validationMessage) {
        showToast(validationMessage, "error");
        return;
      }
    }

    const payload = {
      login,
      grupo: userForm.grupo,
      ativo: userForm.ativo,
      cliente: includeCliente && shouldEditClienteFields ? buildClientePayload() : undefined,
    };

    setSavingUser(true);
    try {
      const response = await api.put("/auth/users/" + selectedUser.id, payload);
      showToast(includeCliente ? "Dados cadastrais atualizados." : "Usuario atualizado.", "success");
      await loadData();
      selectUser(response?.user || { ...selectedUser, ...payload });
    } catch (error) {
      showToast(error.message || "Erro ao atualizar usuario.", "error");
    } finally {
      setSavingUser(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    if (!selectedUser) {
      showToast("Selecione um usuario.", "error");
      return;
    }
    if (!novaSenha || novaSenha.length < 6) {
      showToast("Senha deve ter ao menos 6 caracteres.", "error");
      return;
    }
    if (novaSenha !== confirmarSenha) {
      showToast("As senhas nao coincidem.", "error");
      return;
    }

    setSavingPassword(true);
    try {
      await api.put("/auth/users/" + selectedUser.id + "/password", {
        novaSenha,
        primeiroAcesso,
      });
      setNovaSenha("");
      setConfirmarSenha("");
      showToast("Senha alterada.", "success");
      await loadData();
    } catch (error) {
      showToast(error.message || "Erro ao alterar senha.", "error");
    } finally {
      setSavingPassword(false);
    }
  }

  function startDeleteUser(user) {
    setDeleteWarningUser(user);
  }

  function acknowledgeDeleteUser(user) {
    setDeleteWarningUser(null);
    setConfirmDeleteUserId(user?.id);
  }

  function cancelDeleteUser() {
    setDeleteWarningUser(null);
    setConfirmDeleteUserId(null);
  }

  async function deleteUser(user) {
    if (!user?.id) {
      showToast("ID do usuario nao encontrado.", "error");
      return;
    }

    setDeletingUserId(user.id);
    try {
      await api.delete("/auth/users/" + user.id);
      showToast("Usuario excluido.", "success");
      setSelectedUser(null);
      setUserForm(null);
      setConfirmDeleteUserId(null);
      await loadData();
    } catch (error) {
      showToast(error.message || "Erro ao excluir usuario.", "error");
    } finally {
      setDeletingUserId(null);
    }
  }

  return (
    <main className="admin-page admin-user-create-page">
      <div className="admin-page-panel admin-page-form admin-user-create-card">
        <header className="admin-user-create-header">
          <div className="admin-user-create-heading">
            <span>Administração de Usuários</span>
            <h2>Manutenção de Usuários</h2>
          </div>
          <p className="admin-user-create-subtitle">
            Pesquise um usuário, revise o vínculo de grupo e atualize acesso,
            dados cadastrais, senha ou exclusão do cadastro.
          </p>
        </header>

        <section className="admin-user-create-section admin-user-search-section">
          <div className="admin-user-section-title">
            <span>Pesquisa</span>
            <h3>Pesquisar usuários</h3>
          </div>

          <label className="admin-user-search-field">
            Buscar usuário
            <input
              type="search"
              value={userSearchTerm}
              onChange={(event) => setUserSearchTerm(event.target.value)}
              onKeyDown={handleUserSearchKeyDown}
              placeholder="Login, grupo, nome ou CPF"
            />
          </label>

          <div className="admin-page-actions admin-user-search-actions">
            <Button type="button" onClick={searchUsers} disabled={loading}>
              Pesquisar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={clearUserSearch}
              disabled={loading && !hasSearchedUsers}
            >
              Limpar
            </Button>
          </div>
        </section>

        {hasSearchedUsers ? (
          <section className="admin-user-create-section admin-user-search-results-section">
            <div className="admin-user-section-title">
              <span>Resultado</span>
              <h3>Usuários encontrados</h3>
            </div>

            <div className="admin-user-search-results">
              {loading ? (
                <p>Carregando usuários...</p>
              ) : filteredUsers.length ? (
                filteredUsers.map((user) => {
                  const isSelected = selectedUser?.id === user.id;
                  return (
                    <article
                      className={isSelected ? "is-selected" : ""}
                      key={user.id || user.login}
                    >
                      <button
                        type="button"
                        className="admin-user-search-result-pick"
                        onClick={() => selectUser(user)}
                      >
                        <strong>{user.login}</strong>
                        <span>{getUserGroupLabel(user, grupos)}</span>
                      </button>
                    </article>
                  );
                })
              ) : (
                <p>Nenhum usuário encontrado.</p>
              )}
            </div>
          </section>
        ) : null}

        {selectedUser && userForm ? (
          <section className="admin-user-maintenance-selected">
            <div className="admin-user-section-title admin-user-maintenance-selected-title">
              <span>Usuário selecionado</span>
              <h3>{selectedUser.login}</h3>
            </div>

            <form
              className="admin-user-create-section"
              onSubmit={(event) => saveUser(event)}
            >
              <div className="admin-user-section-title">
                <span>Acesso</span>
                <h3>Dados do acesso</h3>
              </div>

              <div className="admin-user-create-grid">
                <label>
                  Login
                  <input
                    type="text"
                    value={userForm.login}
                    onChange={(event) =>
                      updateUserField("login", event.target.value)
                    }
                    autoComplete="username"
                  />
                </label>

                <label>
                  Vincular ao Grupo
                  <select
                    value={userForm.grupo}
                    onChange={(event) =>
                      updateUserField("grupo", event.target.value)
                    }
                    disabled={loading}
                  >
                    <option value="">Selecionar grupo</option>
                    {grupos.map((grupo) => (
                      <option key={grupo.id || grupo.nome} value={grupo.id}>
                        {getGroupLabel(grupo)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="admin-page-checkbox admin-user-active-toggle">
                  <input
                    type="checkbox"
                    checked={userForm.ativo}
                    onChange={(event) =>
                      updateUserField("ativo", event.target.checked)
                    }
                  />
                  <span>Usuário ativo</span>
                </label>
              </div>

              <div className="admin-page-actions admin-user-maintenance-actions">
                {confirmDeleteUserId === selectedUser.id ? (
                  <>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => deleteUser(selectedUser)}
                      disabled={deletingUserId === selectedUser.id}
                    >
                      {deletingUserId === selectedUser.id
                        ? "Excluindo..."
                        : "Confirmar"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={cancelDeleteUser}
                      disabled={deletingUserId === selectedUser.id}
                    >
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => startDeleteUser(selectedUser)}
                    disabled={savingUser || deletingUserId === selectedUser.id}
                  >
                    Excluir usuário
                  </Button>
                )}
                <Button type="submit" disabled={savingUser || loading}>
                  {savingUser ? "Salvando..." : "Salvar alterações"}
                </Button>
              </div>
            </form>

            <form className="admin-user-create-section" onSubmit={savePassword}>
              <div className="admin-user-section-title">
                <span>Senha</span>
                <h3>Alteração de senha</h3>
              </div>

              <div className="admin-user-create-grid">
                <label>
                  Nova senha
                  <input
                    type="password"
                    value={novaSenha}
                    onChange={(event) => setNovaSenha(event.target.value)}
                    placeholder="Nova senha"
                    autoComplete="new-password"
                  />
                </label>

                <label>
                  Confirmar senha
                  <input
                    type="password"
                    value={confirmarSenha}
                    onChange={(event) => setConfirmarSenha(event.target.value)}
                    placeholder="Confirmar senha"
                    autoComplete="new-password"
                  />
                </label>

                <label className="admin-page-checkbox admin-user-active-toggle admin-first-access-toggle">
                  <input
                    type="checkbox"
                    checked={primeiroAcesso}
                    onChange={(event) => setPrimeiroAcesso(event.target.checked)}
                  />
                  <span>Marcar como primeiro acesso</span>
                </label>
              </div>

              <div className="admin-page-actions admin-user-create-actions">
                <Button type="submit" disabled={savingPassword}>
                  {savingPassword ? "Alterando..." : "Alterar senha"}
                </Button>
              </div>
            </form>

            {shouldEditClienteFields ? (
              <form
                className="admin-user-create-section admin-user-maintenance-client-form"
                onSubmit={(event) => saveUser(event, { includeCliente: true })}
              >
                <div className="admin-user-section-title">
                    <span>Cadastro</span>
                    <h3>Dados cadastrais</h3>
                  </div>

                  <div className="admin-page-form-grid">
                    <label>
                      Nome
                      <input
                        type="text"
                        value={userForm.cliente.nome}
                        onChange={(event) =>
                          updateClienteField("nome", event.target.value)
                        }
                        required
                      />
                    </label>
                    <label>
                      CPF
                      <input
                        type="text"
                        value={userForm.cliente.cpf}
                        onChange={(event) => updateMaskedClienteField("cpf", event)}
                        inputMode="numeric"
                        maxLength={14}
                        required
                      />
                    </label>
                    <label>
                      RG
                      <input
                        type="text"
                        value={userForm.cliente.rg}
                        onChange={(event) => updateMaskedClienteField("rg", event)}
                        maxLength={15}
                        required
                      />
                    </label>
                    <label>
                      Data de nascimento
                      <input
                        type="date"
                        value={userForm.cliente.data_nascimento}
                        onChange={(event) =>
                          updateClienteField("data_nascimento", event.target.value)
                        }
                        required
                      />
                    </label>
                    <label>
                      Telefone
                      <input
                        type="tel"
                        value={userForm.cliente.telefone}
                        onChange={(event) =>
                          updateMaskedClienteField("telefone", event)
                        }
                        inputMode="tel"
                        maxLength={15}
                        required
                      />
                    </label>
                    <label>
                      WhatsApp
                      <input
                        type="tel"
                        value={userForm.cliente.whatsapp}
                        onChange={(event) =>
                          updateMaskedClienteField("whatsapp", event)
                        }
                        inputMode="tel"
                        maxLength={15}
                        required
                      />
                    </label>
                    <label>
                      Email
                      <input
                        type="email"
                        value={userForm.cliente.email}
                        onChange={(event) =>
                          updateClienteField("email", event.target.value)
                        }
                        required
                      />
                    </label>
                    <label className="admin-page-checkbox admin-page-checkbox-field admin-client-active-toggle">
                      <input
                        type="checkbox"
                        checked={userForm.cliente.ativo}
                        onChange={(event) =>
                          updateClienteField("ativo", event.target.checked)
                        }
                      />
                      Cliente ativo
                    </label>
                  </div>

                  <label>
                    Observações
                    <textarea
                      value={userForm.cliente.observacoes}
                      onChange={(event) =>
                        updateClienteField("observacoes", event.target.value)
                      }
                    />
                  </label>

                  <AddressFields
                    addresses={userForm.cliente.enderecos}
                    onChange={updateClienteAddresses}
                  />

                <div className="admin-page-actions admin-user-create-actions admin-user-maintenance-client-actions">
                  <Button type="submit" disabled={savingUser || loading}>
                    {savingUser ? "Salvando..." : "Salvar dados cadastrais"}
                  </Button>
                </div>
              </form>
            ) : null}
          </section>
        ) : null}

        <Modal
          isOpen={Boolean(deleteWarningUser)}
          onClose={cancelDeleteUser}
          title="Atenção"
          closeOnBackdropClick={false}
          showCloseButton={false}
          containerStyle={{ width: "min(94%, 520px)" }}
        >
          <div className="admin-page-delete-modal">
            <p>
              Atenção, excluir um usuário irá excluir todos os dados vinculados
              a ele no banco e na pasta de uploads. Faça com muita cautela!
            </p>

            <div className="modal-actions">
              <Button
                type="button"
                variant="danger"
                onClick={() => acknowledgeDeleteUser(deleteWarningUser)}
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
      </div>
    </main>
  );
}

export default AdminUserMaintenancePage;
