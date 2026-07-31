export const MODULES = [
  { value: "melpethostel", label: "Mel Pet Hostel" },
  { value: "administradores", label: "Administradores" },
];

export const EMPTY_CLIENT_FORM = {
  nome: "",
  cpf: "",
  rg: "",
  data_nascimento: "",
  telefone: "",
  whatsapp: "",
  email: "",
  observacoes: "",
  enderecos: [],
  ativo: true,
};

export const EMPTY_USER_FORM = {
  login: "",
  grupo: "",
  senha: "",
  ativo: true,
  cliente: EMPTY_CLIENT_FORM,
};

export function getGroupLabel(grupo) {
  return grupo?.nome || grupo?.name || grupo?.id || "Sem nome";
}

export function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isAdminGroupName(value) {
  return normalizeText(value).includes("admin");
}

export function isAdminGroup(grupo) {
  return isAdminGroupName(getGroupLabel(grupo));
}

function isNumericId(value) {
  return /^\d+$/.test(String(value || "").trim());
}

function findGroupForUserValue(rawValue, grupos) {
  const byId = grupos.find((grupo) => String(grupo.id || "") === rawValue);
  if (byId) return byId;

  return grupos.find(
    (grupo) =>
      !isNumericId(grupo.id) &&
      String(grupo.nome || grupo.name || "") === rawValue,
  );
}

export function findGroupByValue(rawValue, grupos) {
  return findGroupForUserValue(String(rawValue || ""), grupos);
}

export function getUserGroupValue(user, grupos) {
  const rawValue = String(user?.grupo || "");
  const group = findGroupForUserValue(rawValue, grupos);
  return group ? String(group.id) : rawValue;
}

export function getUserGroupLabel(user, grupos) {
  const rawValue = String(user?.grupo || "");
  const group = findGroupForUserValue(rawValue, grupos);
  return group
    ? getGroupLabel(group)
    : user?.grupoNome || rawValue || "Sem grupo";
}

export function userHasAdminGroup(user, grupos) {
  const group = findGroupForUserValue(String(user?.grupo || ""), grupos);
  return isAdminGroupName(user?.grupoNome || getGroupLabel(group));
}
