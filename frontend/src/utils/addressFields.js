import { onlyDigits } from "./brFields";

export const EMPTY_ADDRESS_FORM = {
  id: null,
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  uf: "",
  ibge: "",
  gia: "",
  ddd: "",
  siafi: "",
  principal: true,
  ativo: true,
};

export function maskCep(value, { progressive = true } = {}) {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 5) {
    return digits.length === 5 && progressive ? `${digits}-` : digits;
  }
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function applyCepMask(event) {
  const inputType = event.nativeEvent?.inputType || "";
  const value = event.currentTarget.value;
  const digits = cepDigits(value);
  const withoutTrailingSeparator = maskCep(value, { progressive: false });
  const deletedTrailingSeparator =
    inputType === "deleteContentBackward" && value === withoutTrailingSeparator;
  const masked = deletedTrailingSeparator
    ? maskCep(digits.slice(0, -1))
    : maskCep(value);

  event.currentTarget.value = masked;
  return masked;
}

export function cepDigits(value) {
  return onlyDigits(value).slice(0, 8);
}

export function isAddressEmpty(address = {}) {
  return [
    "cep",
    "logradouro",
    "numero",
    "complemento",
    "bairro",
    "cidade",
    "estado",
    "uf",
  ].every((key) => !String(address[key] || "").trim());
}

export function createAddressForm(address = {}, index = 0) {
  return {
    ...EMPTY_ADDRESS_FORM,
    ...address,
    cep: maskCep(address.cep),
    uf: String(address.uf || "").toUpperCase().slice(0, 2),
    principal: address.principal === undefined ? index === 0 : address.principal,
    ativo: address.ativo === undefined ? true : address.ativo !== false,
  };
}

export function createAddressList(addresses = []) {
  const list = Array.isArray(addresses)
    ? addresses.map((address, index) => createAddressForm(address, index))
    : [];

  return list.length ? list : [createAddressForm()];
}

export function normalizeAddressList(addresses = []) {
  const next = Array.isArray(addresses) ? addresses : [];
  const hasPrincipal = next.some((address) => address.principal);

  return next.map((address, index) => ({
    ...address,
    principal: hasPrincipal ? Boolean(address.principal) : index === 0,
  }));
}

export function buildAddressesPayload(addresses = []) {
  return normalizeAddressList(addresses)
    .filter((address) => !isAddressEmpty(address))
    .map((address) => ({
      id: address.id || undefined,
      cep: maskCep(address.cep),
      logradouro: String(address.logradouro || "").trim(),
      numero: String(address.numero || "").trim(),
      complemento: String(address.complemento || "").trim(),
      bairro: String(address.bairro || "").trim(),
      cidade: String(address.cidade || "").trim(),
      estado: String(address.estado || "").trim(),
      uf: String(address.uf || "").trim().toUpperCase().slice(0, 2),
      ibge: String(address.ibge || "").trim(),
      gia: String(address.gia || "").trim(),
      ddd: String(address.ddd || "").trim(),
      siafi: String(address.siafi || "").trim(),
      principal: Boolean(address.principal),
      ativo: address.ativo !== false,
    }));
}

export function getAddressValidationMessage(addresses = [], options = {}) {
  const { required = false } = options;
  const filledAddresses = (addresses || []).filter(
    (address) => !isAddressEmpty(address),
  );

  if (required && !filledAddresses.length) {
    return "Informe pelo menos um endereco.";
  }

  if (
    required &&
    filledAddresses.length &&
    !filledAddresses.some((address) => address.principal)
  ) {
    return "Marque um endereco principal.";
  }

  for (const address of filledAddresses) {
    if (isAddressEmpty(address)) continue;

    if (cepDigits(address.cep).length !== 8) return "CEP invalido.";
    if (!String(address.logradouro || "").trim()) {
      return "Logradouro e obrigatorio.";
    }
    if (!String(address.numero || "").trim()) return "Numero e obrigatorio.";
    if (!String(address.bairro || "").trim()) return "Bairro e obrigatorio.";
    if (!String(address.cidade || "").trim()) return "Cidade e obrigatoria.";
    if (!/^[A-Za-z]{2}$/.test(String(address.uf || "").trim())) {
      return "UF invalida.";
    }
  }

  return "";
}

export async function fetchAddressByCep(value) {
  const digits = cepDigits(value);
  if (digits.length !== 8) {
    throw new Error("CEP invalido.");
  }

  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  const data = await response.json();

  if (!response.ok || data?.erro) {
    throw new Error("CEP nao encontrado.");
  }

  return {
    cep: maskCep(data.cep || digits),
    logradouro: data.logradouro || "",
    complemento: data.complemento || "",
    bairro: data.bairro || "",
    cidade: data.localidade || data.cidade || "",
    estado: data.estado || "",
    uf: data.uf || "",
    ibge: data.ibge || "",
    gia: data.gia || "",
    ddd: data.ddd || "",
    siafi: data.siafi || "",
  };
}
