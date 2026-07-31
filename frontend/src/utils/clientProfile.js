import {
  getClientFieldValidationMessage,
  maskBrazilPhone,
  maskCpf,
  maskRg,
} from "./brFields";
import {
  getAddressValidationMessage,
  isAddressEmpty,
  maskCep,
} from "./addressFields";

const REQUIRED_CLIENT_FIELDS = [
  ["nome", "Nome"],
  ["cpf", "CPF"],
  ["rg", "RG"],
  ["data_nascimento", "Data de nascimento"],
  ["telefone", "Telefone"],
  ["whatsapp", "WhatsApp"],
  ["email", "Email"],
];

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function isReservedName(value) {
  return clean(value).toLowerCase().startsWith("cadastro pendente");
}

export function getClientProfileValidationMessage(cliente = {}) {
  const missing = [];

  for (const [key, label] of REQUIRED_CLIENT_FIELDS) {
    if (!clean(cliente[key]) || (key === "nome" && isReservedName(cliente[key]))) {
      missing.push(label);
    }
  }

  if (missing.length) {
    return `Preencha os campos obrigatorios: ${missing.join(", ")}.`;
  }

  const formatMessage = getClientFieldValidationMessage(cliente);
  if (formatMessage) return formatMessage;

  return getAddressValidationMessage(cliente.enderecos, { required: true });
}

export function getPrincipalAddress(enderecos = []) {
  const list = Array.isArray(enderecos)
    ? enderecos.filter((endereco) => endereco && endereco.ativo !== false)
    : [];

  return (
    list.find((endereco) => Boolean(endereco.principal)) ||
    list.find(
      (endereco) =>
        !isAddressEmpty(endereco) && !getAddressValidationMessage([endereco]),
    ) ||
    list[0] ||
    null
  );
}

function joinPhones(telefone, whatsapp) {
  const phones = [maskBrazilPhone(telefone), maskBrazilPhone(whatsapp)]
    .map(clean)
    .filter(Boolean);
  const uniquePhones = [...new Set(phones)];
  return uniquePhones.join(" / ");
}

export function buildContractorDataFromCliente(cliente) {
  const endereco = getPrincipalAddress(cliente?.enderecos);

  return {
    nome: clean(cliente?.nome),
    rg: maskRg(cliente?.rg),
    cpf: maskCpf(cliente?.cpf),
    telefones: joinPhones(cliente?.telefone, cliente?.whatsapp),
    email: clean(cliente?.email),
    endereco: clean(endereco?.logradouro),
    numero: clean(endereco?.numero),
    complemento: clean(endereco?.complemento),
    bairro: clean(endereco?.bairro),
    cidade: clean(endereco?.cidade),
    estado: clean(endereco?.uf || endereco?.estado).toUpperCase().slice(0, 2),
    cep: maskCep(endereco?.cep, { progressive: false }),
  };
}
