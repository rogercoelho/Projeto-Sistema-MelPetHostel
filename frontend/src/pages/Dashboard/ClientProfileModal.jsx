import { useEffect, useState } from "react";
import { Alert, Button, Input, Modal } from "../../components";
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
import AddressFields from "./AddressFields";

const EMPTY_FORM = {
  nome: "",
  cpf: "",
  rg: "",
  data_nascimento: "",
  telefone: "",
  whatsapp: "",
  email: "",
  observacoes: "",
  enderecos: [],
};

function isReservedName(value) {
  return String(value || "").toLowerCase().startsWith("cadastro pendente");
}

function createForm(cliente) {
  const source = cliente || {};

  return {
    ...EMPTY_FORM,
    ...source,
    nome: isReservedName(source.nome) ? "" : source.nome || "",
    cpf: maskCpf(source.cpf),
    rg: maskRg(source.rg),
    telefone: maskBrazilPhone(source.telefone),
    whatsapp: maskBrazilPhone(source.whatsapp),
    data_nascimento: toISODate(source.data_nascimento),
    enderecos: createAddressList(source.enderecos),
  };
}

export default function ClientProfileModal({
  isOpen,
  onClose,
  onSubmit,
  initialCliente,
}) {
  const [form, setForm] = useState(() => createForm(initialCliente));
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(createForm(initialCliente));
      setMessage("");
    }
  }, [initialCliente, isOpen]);

  function updateField(field, value) {
    setForm((state) => ({ ...state, [field]: value }));
  }

  function updateMaskedField(field, event) {
    updateField(field, applyClientFieldMask(field, event));
  }

  function updateAddresses(enderecos) {
    setForm((state) => ({ ...state, enderecos }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    const validationMessage = getClientProfileValidationMessage(form);
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        ...form,
        nome: form.nome.trim(),
        cpf: cpfDigits(form.cpf),
        rg: form.rg.trim(),
        telefone: form.telefone.trim(),
        whatsapp: form.whatsapp.trim(),
        email: form.email.trim(),
        observacoes: form.observacoes.trim(),
        enderecos: buildAddressesPayload(form.enderecos),
      });
    } catch (error) {
      setMessage(error.message || "Erro ao salvar cadastro.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Dados cadastrais"
      closeOnBackdropClick={false}
      containerStyle={{ width: "min(96%, 760px)" }}
    >
      <form className="client-profile-form" onSubmit={handleSubmit}>
        <p>
          Complete seu cadastro para continuar usando o sistema.
        </p>

        <div className="client-profile-grid">
          <Input
            label="Nome"
            name="nome"
            value={form.nome}
            onChange={(event) => updateField("nome", event.target.value)}
            placeholder="Nome completo"
            required
          />
          <Input
            label="CPF"
            name="cpf"
            value={form.cpf}
            onChange={(event) => updateMaskedField("cpf", event)}
            inputMode="numeric"
            maxLength={14}
            placeholder="000.000.000-00"
            required
          />
          <Input
            label="RG"
            name="rg"
            value={form.rg}
            onChange={(event) => updateMaskedField("rg", event)}
            maxLength={15}
            placeholder="00.000.000-0"
            required
          />
          <Input
            label="Data de nascimento"
            name="data_nascimento"
            type="date"
            value={form.data_nascimento}
            onChange={(event) =>
              updateField("data_nascimento", event.target.value)
            }
            required
          />
          <Input
            label="Telefone"
            name="telefone"
            type="tel"
            value={form.telefone}
            onChange={(event) => updateMaskedField("telefone", event)}
            inputMode="tel"
            maxLength={15}
            placeholder="(00) 00000-0000"
            required
          />
          <Input
            label="WhatsApp"
            name="whatsapp"
            type="tel"
            value={form.whatsapp}
            onChange={(event) => updateMaskedField("whatsapp", event)}
            inputMode="tel"
            maxLength={15}
            placeholder="(00) 00000-0000"
            required
          />
          <Input
            label="Email"
            name="email"
            type="email"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
            placeholder="email@exemplo.com"
            required
          />
        </div>

        <label className="client-profile-notes">
          Observacoes
          <textarea
            value={form.observacoes}
            onChange={(event) => updateField("observacoes", event.target.value)}
            placeholder="Observacoes"
          />
        </label>

        <AddressFields addresses={form.enderecos} onChange={updateAddresses} />

        {message ? <Alert type="error">{message}</Alert> : null}

        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Sair
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Salvando..." : "Salvar cadastro"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
