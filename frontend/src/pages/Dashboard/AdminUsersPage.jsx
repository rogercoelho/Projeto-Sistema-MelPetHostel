import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../components";
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
  EMPTY_USER_FORM,
  findGroupByValue,
  getGroupLabel,
  isAdminAccessGroup,
} from "./adminManagementUtils";
import AddressFields from "./AddressFields";


function createEmptyUserForm() {
  return {
    ...EMPTY_USER_FORM,
    cliente: {
      ...EMPTY_CLIENT_FORM,
      cpf: maskCpf(EMPTY_CLIENT_FORM.cpf),
      rg: maskRg(EMPTY_CLIENT_FORM.rg),
      telefone: maskBrazilPhone(EMPTY_CLIENT_FORM.telefone),
      whatsapp: maskBrazilPhone(EMPTY_CLIENT_FORM.whatsapp),
      enderecos: createAddressList(EMPTY_CLIENT_FORM.enderecos),
    },
  };
}

function AdminUsersPage({ onBack }) {
  const [grupos, setGrupos] = useState([]);
  const [usuarioForm, setUsuarioForm] = useState(createEmptyUserForm);
  const [usuarios, setUsuarios] = useState([]);
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [submittedUserSearchTerm, setSubmittedUserSearchTerm] = useState("");
  const [hasSearchedUsers, setHasSearchedUsers] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const selectedGroup = useMemo(
    () => findGroupByValue(usuarioForm.grupo, grupos),
    [grupos, usuarioForm.grupo],
  );
  const shouldShowClienteFields = isAdminAccessGroup(selectedGroup);

  const loadGroups = useCallback(async function loadGroups() {
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
      showToast(error.message || "Erro ao carregar grupos.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  function resetForm() {
    setUsuarioForm(createEmptyUserForm());
  }

  function updateUserField(field, value) {
    setUsuarioForm((state) => ({
      ...state,
      [field]: value,
    }));
  }

  function updateClienteField(field, value) {
    setUsuarioForm((state) => ({
      ...state,
      cliente: {
        ...state.cliente,
        [field]: value,
      },
    }));
  }

  function updateClienteAddresses(enderecos) {
    setUsuarioForm((state) => ({
      ...state,
      cliente: {
        ...state.cliente,
        enderecos,
      },
    }));
  }

  function updateMaskedClienteField(field, event) {
    updateClienteField(field, applyClientFieldMask(field, event));
  }

  function buildClientePayload() {
    return {
      ...usuarioForm.cliente,
      nome: usuarioForm.cliente.nome.trim(),
      cpf: cpfDigits(usuarioForm.cliente.cpf),
      rg: usuarioForm.cliente.rg.trim(),
      telefone: usuarioForm.cliente.telefone.trim(),
      whatsapp: usuarioForm.cliente.whatsapp.trim(),
      email: usuarioForm.cliente.email.trim(),
      observacoes: usuarioForm.cliente.observacoes.trim(),
      enderecos: buildAddressesPayload(usuarioForm.cliente.enderecos),
    };
  }

  const filteredUsers = useMemo(() => {
    const search = submittedUserSearchTerm.trim().toLowerCase();
    if (!hasSearchedUsers) return [];
    if (!search) return usuarios;
    return usuarios.filter((user) =>
      [user.login, user.grupoNome, user.Grupo_Nome, user.cliente?.nome]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search)),
    );
  }, [hasSearchedUsers, usuarios, submittedUserSearchTerm]);

  function searchUsers() {
    setSubmittedUserSearchTerm(userSearchTerm);
    setHasSearchedUsers(true);
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
  }

  async function saveUser(event) {
    event.preventDefault();
    const login = usuarioForm.login.trim();
    const grupo = usuarioForm.grupo;

    if (!login || !grupo) {
      showToast("Login e grupo sao obrigatorios.", "error");
      return;
    }

    if (!usuarioForm.senha) {
      showToast("Senha provisoria e obrigatoria.", "error");
      return;
    }

    if (shouldShowClienteFields) {
      const validationMessage = getClientProfileValidationMessage(
        usuarioForm.cliente,
      );
      if (validationMessage) {
        showToast(validationMessage, "error");
        return;
      }
    }

    const payload = {
      login,
      grupo,
      ativo: usuarioForm.ativo,
      cliente: shouldShowClienteFields ? buildClientePayload() : undefined,
      senhaProvisoria: usuarioForm.senha,
    };

    setSaving(true);
    try {
      await api.post("/auth/users", payload);
      showToast("Usuario criado.", "success");
      resetForm();
      await loadGroups();
    } catch (error) {
      showToast(error.message || "Erro ao criar usuario.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="admin-page admin-user-create-page">
      <form
        className="admin-page-panel admin-page-form admin-user-create-card"
        onSubmit={saveUser}
      >
        <header className="admin-user-create-header">
          <div className="admin-user-create-heading">
            <span>Administração de Usuários</span>
            <h2>Criar usuário</h2>
          </div>
          <p className="admin-user-create-subtitle">
            Crie o login do Usuário, selecione o grupo, defina a senha
            provisória e determine se o usuário está ativo no sistema.
          </p>
        </header>

        <section className="admin-user-create-section">
          <div className="admin-user-section-title">
            <span>Acesso</span>
            <h3>Dados do login</h3>
          </div>
          <div className="admin-user-create-grid">
            <label>
              Login
              <input
                type="text"
                value={usuarioForm.login}
                onChange={(event) =>
                  updateUserField("login", event.target.value)
                }
                placeholder="Login do usuário"
                autoComplete="username"
              />
            </label>

            <label>
              Vincular ao Grupo
              <select
                value={usuarioForm.grupo}
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

            <label>
              Senha provisória
              <input
                type="text"
                value={usuarioForm.senha}
                onChange={(event) =>
                  updateUserField("senha", event.target.value)
                }
                placeholder="Senha provisória"
                autoComplete="new-password"
              />
            </label>

            <label className="admin-page-checkbox admin-user-active-toggle">
              <input
                type="checkbox"
                checked={usuarioForm.ativo}
                onChange={(event) =>
                  updateUserField("ativo", event.target.checked)
                }
              />
              <span>Usuário ativo</span>
            </label>
          </div>

          <div className="admin-page-actions admin-user-create-actions">
            <Button type="submit" disabled={saving || loading}>
              {saving ? "Criando..." : "Criar usuário"}
            </Button>
          </div>
        </section>

        {shouldShowClienteFields ? (
          <section className="admin-user-create-section admin-user-client-section">
          <div className="admin-user-section-title">
            <span>Cadastro</span>
            <h3>Dados cadastrais</h3>
          </div>

          <div className="admin-page-form-grid">
              <label>
                Nome
                <input
                  type="text"
                  value={usuarioForm.cliente.nome}
                  onChange={(event) =>
                    updateClienteField("nome", event.target.value)
                  }
                  placeholder="Nome completo"
                  required
                />
              </label>
              <label>
                CPF
                <input
                  type="text"
                  value={usuarioForm.cliente.cpf}
                  onChange={(event) => updateMaskedClienteField("cpf", event)}
                  inputMode="numeric"
                  maxLength={14}
                  placeholder="000.000.000-00"
                  required
                />
              </label>
              <label>
                RG
                <input
                  type="text"
                  value={usuarioForm.cliente.rg}
                  onChange={(event) => updateMaskedClienteField("rg", event)}
                  maxLength={15}
                  placeholder="00.000.000-0"
                  required
                />
              </label>
              <label>
                Data de nascimento
                <input
                  type="date"
                  value={usuarioForm.cliente.data_nascimento}
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
                  value={usuarioForm.cliente.telefone}
                  onChange={(event) =>
                    updateMaskedClienteField("telefone", event)
                  }
                  inputMode="tel"
                  maxLength={15}
                  placeholder="(00) 00000-0000"
                  required
                />
              </label>
              <label>
                WhatsApp
                <input
                  type="tel"
                  value={usuarioForm.cliente.whatsapp}
                  onChange={(event) =>
                    updateMaskedClienteField("whatsapp", event)
                  }
                  inputMode="tel"
                  maxLength={15}
                  placeholder="(00) 00000-0000"
                  required
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={usuarioForm.cliente.email}
                  onChange={(event) =>
                    updateClienteField("email", event.target.value)
                  }
                  placeholder="email@exemplo.com"
                  required
                />
              </label>
              <label className="admin-page-checkbox admin-page-checkbox-field">
                <input
                  type="checkbox"
                  checked={usuarioForm.cliente.ativo}
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
                value={usuarioForm.cliente.observacoes}
                onChange={(event) =>
                  updateClienteField("observacoes", event.target.value)
                }
                placeholder="Observações"
              />
            </label>
            <AddressFields
              addresses={usuarioForm.cliente.enderecos}
              onChange={updateClienteAddresses}
            />
          </section>
        ) : null}

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
              placeholder="Login, grupo ou nome"
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
              filteredUsers.map((user) => (
                <article key={user.id || user.login}>
                  <strong>{user.login}</strong>
                  <span>
                    {user.grupoNome ||
                      user.Grupo_Nome ||
                      user.grupo ||
                      "Sem grupo"}
                  </span>
                </article>
              ))
            ) : (
              <p>Nenhum usuário encontrado.</p>
            )}
          </div>
          </section>
        ) : null}


        <div className="admin-user-create-footer">
          <Button type="button" variant="outline" onClick={onBack}>
            Voltar
          </Button>
        </div>
      </form>
    </main>
  );
}

export default AdminUsersPage;
