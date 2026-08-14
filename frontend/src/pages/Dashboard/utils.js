export function isAdminUser(usuario) {
  if (!usuario) return false;

  const acesso = String(usuario.grupoAcesso || usuario.Grupo_Acesso || "").toLowerCase();

  return acesso === "adm";
}

export function userNeedsPasswordChange(usuario) {
  if (!usuario) return false;

  const flags = [
    "must_change_password",
    "mustChangePassword",
    "senha_provisoria",
    "senhaProvisoria",
    "temporaryPassword",
    "temporary_password",
    "senha_temp",
    "tem_senha_provisoria",
    "forcar_troca_senha",
    "primeiroAcesso",
    "Primeiro_Acesso",
    "primeiro_acesso",
  ];

  return flags.some((key) => {
    if (!Object.prototype.hasOwnProperty.call(usuario, key)) return false;
    const value = usuario[key];
    return (
      value === true ||
      value === 1 ||
      value === "1" ||
      (typeof value === "string" && value.toLowerCase() === "true")
    );
  });
}

export function clearPasswordChangeFlagsFromStorage() {
  const saved = localStorage.getItem("usuario");
  if (!saved) return;

  try {
    const usuario = JSON.parse(saved);
    [
      "must_change_password",
      "mustChangePassword",
      "senha_provisoria",
      "senhaProvisoria",
      "temporaryPassword",
      "temporary_password",
      "senha_temp",
      "tem_senha_provisoria",
      "forcar_troca_senha",
      "primeiroAcesso",
      "Primeiro_Acesso",
      "primeiro_acesso",
    ].forEach((key) => delete usuario[key]);
    localStorage.setItem("usuario", JSON.stringify(usuario));
  } catch {
    // Ignore invalid local storage state.
  }
}

export function userBelongsToGroup(usuario, grupo) {
  const userGroup = (
    usuario.grupo ??
    usuario.group ??
    usuario.Grupo_ID ??
    ""
  ).toString();
  const groupId = (grupo.id ?? "").toString();
  const groupName = (grupo.nome ?? grupo.name ?? "").toString();

  if (!userGroup || !groupId) return false;
  if (userGroup === groupId) return true;
  if (/^\d+$/.test(groupId)) return false;

  return userGroup === groupName;
}
