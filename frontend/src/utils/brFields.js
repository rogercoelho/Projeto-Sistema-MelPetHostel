export function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function cpfDigits(value) {
  return onlyDigits(value).slice(0, 11);
}

export function onlyRgChars(value) {
  return String(value || "")
    .replace(/[^0-9a-zA-Z]/g, "")
    .toUpperCase()
    .slice(0, 12);
}

export function maskCpf(value, { progressive = true } = {}) {
  const digits = cpfDigits(value);

  if (digits.length <= 3) {
    return digits.length === 3 && progressive ? `${digits}.` : digits;
  }

  if (digits.length <= 6) {
    const out = `${digits.slice(0, 3)}.${digits.slice(3)}`;
    return digits.length === 6 && progressive ? `${out}.` : out;
  }

  if (digits.length <= 9) {
    const out = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return digits.length === 9 && progressive ? `${out}-` : out;
  }

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function validateCpf(value) {
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

export function maskRg(value, { progressive = true } = {}) {
  const raw = onlyRgChars(value);
  if (raw.length > 9) return raw;

  if (raw.length <= 2) {
    return raw.length === 2 && progressive ? `${raw}.` : raw;
  }

  if (raw.length <= 5) {
    const out = `${raw.slice(0, 2)}.${raw.slice(2)}`;
    return raw.length === 5 && progressive ? `${out}.` : out;
  }

  if (raw.length <= 8) {
    const out = `${raw.slice(0, 2)}.${raw.slice(2, 5)}.${raw.slice(5)}`;
    return raw.length === 8 && progressive ? `${out}-` : out;
  }

  return `${raw.slice(0, 2)}.${raw.slice(2, 5)}.${raw.slice(5, 8)}-${raw.slice(8)}`;
}

export function validateRg(value) {
  const raw = onlyRgChars(value);
  return !raw || (raw.length >= 5 && raw.length <= 12);
}

export function phoneDigits(value) {
  const digits = onlyDigits(value);
  if (digits.length > 11 && digits.startsWith("55")) {
    return digits.slice(2, 13);
  }
  return digits.slice(0, 11);
}

function phoneFirstGroupSize(digits) {
  return digits[2] === "9" ? 5 : 4;
}

export function maskBrazilPhone(value, { progressive = true } = {}) {
  const digits = phoneDigits(value);
  if (digits.length <= 2) {
    if (digits.length < 2) return digits;
    return progressive ? `(${digits}) ` : `(${digits})`;
  }

  const ddd = digits.slice(0, 2);
  const local = digits.slice(2);
  const firstGroupSize = phoneFirstGroupSize(digits);
  const prefix = `(${ddd}) `;

  if (local.length <= firstGroupSize) {
    const out = `${prefix}${local}`;
    return local.length === firstGroupSize && progressive ? `${out}-` : out;
  }

  return `${prefix}${local.slice(0, firstGroupSize)}-${local.slice(firstGroupSize)}`;
}

export function maskClientField(field, value, options) {
  if (field === "cpf") return maskCpf(value, options);
  if (field === "rg") return maskRg(value, options);
  if (field === "telefone" || field === "whatsapp") {
    return maskBrazilPhone(value, options);
  }
  return value;
}

function getClientFieldRawValue(field, value) {
  if (field === "rg") return onlyRgChars(value);
  if (field === "telefone" || field === "whatsapp") return phoneDigits(value);
  return onlyDigits(value);
}

export function applyClientFieldMask(field, event) {
  const inputType = event.nativeEvent?.inputType || "";
  const value = event.currentTarget.value;
  const raw = getClientFieldRawValue(field, value);
  const withoutTrailingSeparator = maskClientField(field, value, {
    progressive: false,
  });
  const deletedTrailingSeparator =
    inputType === "deleteContentBackward" && value === withoutTrailingSeparator;
  const masked = deletedTrailingSeparator
    ? maskClientField(field, raw.slice(0, -1))
    : maskClientField(field, value);

  event.currentTarget.value = masked;
  return masked;
}

export function validateBrazilPhone(value) {
  const digits = phoneDigits(value);
  if (!digits) return true;
  if (![10, 11].includes(digits.length)) return false;
  if (digits.slice(0, 2) === "00") return false;
  if (!/^[1-9][1-9][2-9]\d{7,8}$/.test(digits)) return false;
  return !/^(\d)\1+$/.test(digits);
}

export function getClientFieldValidationMessage(cliente = {}) {
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
