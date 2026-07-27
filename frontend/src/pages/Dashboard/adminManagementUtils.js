export const MODULES = [
  { value: "melpethostel", label: "Mel Pet Hostel" },
  { value: "administradores", label: "Administradores" },
];

export const EMPTY_USER_FORM = {
  login: "",
  grupo: "",
  senha: "",
};

export function getGroupLabel(grupo) {
  return grupo?.nome || grupo?.name || grupo?.id || "Sem nome";
}

export function getUserGroupValue(user, grupos) {
  const rawValue = String(user?.grupo || "");
  const group = grupos.find(
    (grupo) =>
      String(grupo.id || "") === rawValue ||
      String(grupo.nome || grupo.name || "") === rawValue,
  );
  return group ? String(group.id) : rawValue;
}

export function getUserGroupLabel(user, grupos) {
  const rawValue = String(user?.grupo || "");
  const group = grupos.find(
    (grupo) =>
      String(grupo.id || "") === rawValue ||
      String(grupo.nome || grupo.name || "") === rawValue,
  );
  return group ? getGroupLabel(group) : rawValue || "Sem grupo";
}

