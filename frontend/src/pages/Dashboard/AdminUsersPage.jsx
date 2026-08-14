import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components";
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
  isAdminGroup,
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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const selectedGroup = useMemo(
    () => findGroupByValue(usuarioForm.grupo, grupos),
    [grupos, usuarioForm.grupo],
  );
  const shouldShowClienteFields = isAdminGroup(selectedGroup);

  async function loadGroups() {
    setLoading(true);
    try {
      const groupsData = await api.get("/auth/groups");
      setGrupos(Array.isArray(groupsData) ? groupsData : []);
    } catch (error) {
      setGrupos([]);
      setMessage({
        type: "erro",
        text: error.message || "Erro ao carregar grupos.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGroups();
  }, []);

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

  async function saveUser(event) {
    event.preventDefault();
    const login = usuarioForm.login.trim();
    const grupo = usuarioForm.grupo;

    if (!login || !grupo) {
      setMessage({ type: "erro", text: "Login e grupo sao obrigatorios." });
      return;
    }

    if (!usuarioForm.senha) {
      setMessage({ type: "erro", text: "Senha provisoria e obrigatoria." });
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
      senhaProvisoria: usuarioForm.senha,
    };

    setSaving(true);
    try {
      await api.post("/auth/users", payload);
      setMessage({ type: "sucesso", text: "Usuario criado." });
      resetForm();
    } catch (error) {
      setMessage({
        type: "erro",
        text: error.message || "Erro ao criar usuario.",
      });
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
            <span>Novo acesso</span>
            <h2>Criar usuário</h2>
          </div>
          <p className="admin-user-create-subtitle">
            Configure login, grupo e dados vinculados em um fluxo simples.
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
                onChange={(event) => updateUserField("login", event.target.value)}
                placeholder="Login do usuário"
                autoComplete="username"
              />
            </label>

            <label>
              Grupo
              <select
                value={usuarioForm.grupo}
                onChange={(event) => updateUserField("grupo", event.target.value)}
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
                onChange={(event) => updateUserField("senha", event.target.value)}
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
            <fieldset className="admin-page-fieldset admin-user-client-fieldset">
              <legend>Dados cadastrais</legend>
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
            </fieldset>
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

export default AdminUsersPage;
