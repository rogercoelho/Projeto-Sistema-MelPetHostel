function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function cpfDigits(value) {
  return onlyDigits(value).slice(0, 11);
}

function onlyRgChars(value) {
  return String(value || "")
    .replace(/[^0-9a-zA-Z]/g, "")
    .toUpperCase()
    .slice(0, 12);
}

function maskCpf(value) {
  const digits = cpfDigits(value);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

function validateCpf(value) {
  const cpf = onlyDigits(value);
  if (!cpf) return true;
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(cpf[i]) * (10 - i);
  }
  let digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) {
    sum += Number(cpf[i]) * (11 - i);
  }
  digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;

  return digit === Number(cpf[10]);
}

function maskRg(value) {
  const raw = onlyRgChars(value);
  if (raw.length > 9) return raw;

  return raw
    .replace(/^([0-9A-Z]{2})([0-9A-Z])/, "$1.$2")
    .replace(/^([0-9A-Z]{2})\.([0-9A-Z]{3})([0-9A-Z])/, "$1.$2.$3")
    .replace(
      /^([0-9A-Z]{2})\.([0-9A-Z]{3})\.([0-9A-Z]{3})([0-9A-Z])/,
      "$1.$2.$3-$4",
    );
}

function validateRg(value) {
  const raw = onlyRgChars(value);
  return !raw || (raw.length >= 5 && raw.length <= 12);
}

function phoneDigits(value) {
  const digits = onlyDigits(value);
  if (digits.length > 11 && digits.startsWith("55")) {
    return digits.slice(2, 13);
  }
  return digits.slice(0, 11);
}

function maskBrazilPhone(value) {
  const digits = phoneDigits(value);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function validateBrazilPhone(value) {
  const digits = phoneDigits(value);
  if (!digits) return true;
  if (![10, 11].includes(digits.length)) return false;
  if (digits.slice(0, 2) === "00") return false;
  if (!/^[1-9][1-9][2-9]\d{7,8}$/.test(digits)) return false;
  return !/^(\d)\1+$/.test(digits);
}

function getClientFieldValidationMessage(cliente = {}) {
  if (!validateCpf(cliente.cpf)) return "CPF invalido.";
  if (!validateRg(cliente.rg)) {
    return "RG invalido. Informe de 5 a 12 caracteres.";
  }
  if (!validateBrazilPhone(cliente.telefone)) {
    return "Telefone invalido. Use DDD + numero.";
  }
  if (!validateBrazilPhone(cliente.whatsapp)) {
    return "WhatsApp invalido. Use DDD + numero.";
  }
  return "";
}

module.exports = {
  getClientFieldValidationMessage,
  cpfDigits,
  maskBrazilPhone,
  maskCpf,
  maskRg,
  onlyDigits,
  onlyRgChars,
  phoneDigits,
  validateBrazilPhone,
  validateCpf,
  validateRg,
};
