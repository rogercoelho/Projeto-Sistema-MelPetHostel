import { useEffect, useMemo, useState } from "react";
import { Button, Modal } from "../../components";
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
import { toISODate } from "../../utils/date";
import AdminPageShell from "./AdminPageShell";
import {
  EMPTY_CLIENT_FORM,
  EMPTY_USER_FORM,
  findGroupByValue,
  getGroupLabel,
  getUserGroupLabel,
  getUserGroupValue,
  isAdminGroup,
} from "./adminManagementUtils";
import AddressFields from "./AddressFields";

function createEmptyUserForm() {
  return {
    ...EMPTY_USER_FORM,
    cliente: { ...EMPTY_CLIENT_FORM },
  };
}

function createClienteForm(cliente) {
  const source = cliente || {};

  return {
    ...EMPTY_CLIENT_FORM,
    ...source,
    cpf: maskCpf(source.cpf),
    rg: maskRg(source.rg),
    telefone: maskBrazilPhone(source.telefone),
    whatsapp: maskBrazilPhone(source.whatsapp),
    data_nascimento: toISODate(source.data_nascimento),
    enderecos: createAddressList(source.enderecos),
    ativo: source.ativo !== false,
  };
}

function AdminUsersPage({ onBack }) {
  const [grupos, setGrupos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [usuarioForm, setUsuarioForm] = useState(createEmptyUserForm);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteWarningUser, setDeleteWarningUser] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const selectedGroup = useMemo(
    () => findGroupByValue(usuarioForm.grupo, grupos),
    [grupos, usuarioForm.grupo],
  );
  const shouldShowClienteFields = isAdminGroup(selectedGroup);

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

  function resetForm() {
    setEditingUser(null);
    setUsuarioForm(createEmptyUserForm());
  }

  function startEditUser(user) {
    setMessage(null);
    setDeleteWarningUser(null);
    setConfirmDeleteId(null);
    setEditingUser(user);
    setUsuarioForm({
      login: user.login || "",
      grupo: getUserGroupValue(user, grupos),
      senha: "",
      ativo: user.ativo !== false,
      cliente: createClienteForm(user.cliente),
    });
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

  async function saveUser(event) {
    event.preventDefault();
    const login = usuarioForm.login.trim();
    const grupo = usuarioForm.grupo;

    if (!login || !grupo) {
      setMessage({ type: "erro", text: "Login e grupo sao obrigatorios." });
      return;
    }

    if (!editingUser && !usuarioForm.senha) {
      setMessage({ type: "erro", text: "Senha provisória é obrigatória." });
      return;
    }

    if (shouldShowClienteFields) {
      const validationMessage = getClientProfileValidationMessage(
        usuarioForm.cliente,
      );
      if (validationMessage) {
        setMessage({ type: "erro", text: validationMessage });
        return;
      }
    }

    const payload = {
      login,
      grupo,
      ativo: usuarioForm.ativo,
      cliente: shouldShowClienteFields ? buildClientePayload() : undefined,
    };

    try {
      if (editingUser) {
        await api.put(`/auth/users/${editingUser.id}`, payload);
        setMessage({ type: "sucesso", text: "Usuario atualizado." });
      } else {
        await api.post("/auth/users", {
          ...payload,
          senhaProvisoria: usuarioForm.senha,
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
      await api.delete(`/auth/users/${user.id}`);
      setDeleteWarningUser(null);
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

  function startDeleteUser(user) {
    setMessage(null);
    setDeleteWarningUser(user);
    setConfirmDeleteId(null);
  }

  function acknowledgeDeleteWarning(user) {
    setDeleteWarningUser(null);
    setConfirmDeleteId(user.id);
  }

  function cancelDeleteUser() {
    setDeleteWarningUser(null);
    setConfirmDeleteId(null);
  }

  return (
    <AdminPageShell
      title="Criacao e edicao de usuarios"
      description="Crie logins, vincule grupos e mantenha os dados cadastrais de administradores."
      onBack={onBack}
    >
      <section className="admin-page-layout">
        <form className="admin-page-panel admin-page-form" onSubmit={saveUser}>
          <div className="admin-page-panel-title">
            <span>{editingUser ? "Editando" : "Novo acesso"}</span>
            <h3>{editingUser ? editingUser.login : "Criar usuario"}</h3>
          </div>

          <label>
            Login
            <input
              type="text"
              value={usuarioForm.login}
              onChange={(event) => updateUserField("login", event.target.value)}
              placeholder="Login do usuario"
            />
          </label>

          <label>
            Grupo
            <select
              value={usuarioForm.grupo}
              onChange={(event) => updateUserField("grupo", event.target.value)}
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
                  updateUserField("senha", event.target.value)
                }
                placeholder="Senha provisória"
              />
            </label>
          ) : null}

          <label className="admin-page-checkbox">
            <input
              type="checkbox"
              checked={usuarioForm.ativo}
              onChange={(event) =>
                updateUserField("ativo", event.target.checked)
              }
            />
            Usuario ativo
          </label>

          {shouldShowClienteFields ? (
            <fieldset className="admin-page-fieldset">
              <legend>Dados Cadastrais</legend>
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
                Observacoes
                <textarea
                  value={usuarioForm.cliente.observacoes}
                  onChange={(event) =>
                    updateClienteField("observacoes", event.target.value)
                  }
                  placeholder="Observacoes"
                />
              </label>
              <AddressFields
                addresses={usuarioForm.cliente.enderecos}
                onChange={updateClienteAddresses}
              />
            </fieldset>
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
            <p className={`admin-page-message ${message.type}`}>
              {message.text}
            </p>
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
                    {user.cliente?.nome ? (
                      <span>Cliente: {user.cliente.nome}</span>
                    ) : null}
                    <span>{user.ativo === false ? "Inativo" : "Ativo"}</span>
                  </div>
                  <div className="admin-page-row-actions">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => startEditUser(user)}
                    >
                      Editar
                    </Button>
                    {confirmDeleteId === user.id ? (
                      <>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => deleteUser(user)}
                        >
                          Confirmar
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={cancelDeleteUser}
                        >
                          Cancelar
                        </Button>
                      </>
                    ) : deleteWarningUser?.id === user.id ? (
                      <>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => acknowledgeDeleteWarning(user)}
                        >
                          OK
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={cancelDeleteUser}
                        >
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => startDeleteUser(user)}
                      >
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
            Atenção!! Ao clicar em CONFIRMAR, você irá excluir a pasta, os
            documentos e os registros do banco de dados para esse usuário{" "}
            <strong>{deleteWarningUser?.login}</strong>. Use apenas para
            corrigir um problema de criação de usuário.
          </p>

          <div className="modal-actions">
            <Button
              type="button"
              variant="danger"
              onClick={() => acknowledgeDeleteWarning(deleteWarningUser)}
            >
              OK
            </Button>
          </div>
        </div>
      </Modal>
    </AdminPageShell>
  );
}

export default AdminUsersPage;
