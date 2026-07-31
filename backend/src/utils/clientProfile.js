const {
  getClientFieldValidationMessage,
  onlyDigits,
} = require("./brFields");

const REQUIRED_CLIENT_FIELDS = [
  ["nome", "Nome"],
  ["cpf", "CPF"],
  ["rg", "RG"],
  ["data_nascimento", "Data de nascimento"],
  ["telefone", "Telefone"],
  ["whatsapp", "WhatsApp"],
  ["email", "Email"],
];

const REQUIRED_ADDRESS_FIELDS = [
  ["cep", "CEP"],
  ["logradouro", "Logradouro"],
  ["numero", "Numero"],
  ["bairro", "Bairro"],
  ["cidade", "Cidade"],
  ["uf", "UF"],
];

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function isBlank(value) {
  return !clean(value);
}

function isReservedCliente(cliente) {
  const nome = clean(cliente?.nome).toLowerCase();
  return !cliente || !nome || nome.startsWith("cadastro pendente");
}

function addressHasData(endereco = {}) {
  return REQUIRED_ADDRESS_FIELDS.some(([key]) => !isBlank(endereco[key])) ||
    !isBlank(endereco.complemento) ||
    !isBlank(endereco.estado);
}

function getPrincipalEndereco(enderecos = []) {
  const list = Array.isArray(enderecos)
    ? enderecos.filter((endereco) => endereco && endereco.ativo !== false)
    : [];

  return (
    list.find((endereco) => Boolean(endereco.principal)) ||
    list.find(addressHasData) ||
    null
  );
}

function getAddressMissingFields(endereco) {
  if (!endereco) return ["Endereco principal"];

  const missing = [];
  for (const [key, label] of REQUIRED_ADDRESS_FIELDS) {
    if (key === "cep") {
      if (onlyDigits(endereco.cep).length !== 8) missing.push(label);
      continue;
    }

    if (isBlank(endereco[key])) missing.push(label);
  }

  return missing;
}

function getClienteCadastroStatus(cliente, enderecos = cliente?.enderecos) {
  const pendencias = [];

  if (isReservedCliente(cliente)) {
    pendencias.push("Nome");
  }

  for (const [key, label] of REQUIRED_CLIENT_FIELDS) {
    if (isBlank(cliente?.[key])) pendencias.push(label);
  }

  const fieldValidationMessage = getClientFieldValidationMessage(cliente || {});
  if (fieldValidationMessage) pendencias.push(fieldValidationMessage);

  const enderecoPrincipal = getPrincipalEndereco(enderecos);
  const addressMissingFields = getAddressMissingFields(enderecoPrincipal);
  pendencias.push(...addressMissingFields);

  const uniquePendencias = [...new Set(pendencias)];

  return {
    completo: uniquePendencias.length === 0,
    pendente: uniquePendencias.length > 0,
    pendencias: uniquePendencias,
    enderecoPrincipal,
  };
}

function getClienteCadastroValidationMessage(cliente, enderecos) {
  const status = getClienteCadastroStatus(cliente, enderecos);
  if (status.completo) return "";

  const preview = status.pendencias.slice(0, 4).join(", ");
  const suffix = status.pendencias.length > 4 ? "..." : "";
  return `Complete os dados cadastrais obrigatorios: ${preview}${suffix}`;
}

module.exports = {
  getClienteCadastroStatus,
  getClienteCadastroValidationMessage,
  getPrincipalEndereco,
  isReservedCliente,
};
