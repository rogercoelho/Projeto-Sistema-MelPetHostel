const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs").promises;
const { getClientFieldValidationMessage } = require("../utils/brFields");
const {
  getClienteCadastroStatus,
  getClienteCadastroValidationMessage,
} = require("../utils/clientProfile");
const { sanitizePart } = require("../utils/uploadsUtils");
const {
  notifyMelPetHostelLoginAccess,
} = require("../utils/moduleAccessNotification");
const { Cliente, Endereco, Grupo, Usuario } = require("../models");
const dbFor = require("../utils/dbFor");
const { tableExists } = require("../models/schema");
const {
  ensureUserDocumentStorage,
} = require("./melpethostel/context");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const DEFAULT_MODULE = "melpethostel";

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function isNumeric(value) {
  return /^\d+$/.test(clean(value));
}

function isAdminAccessValue(value) {
  return clean(value).toLowerCase() === "adm";
}

function isAdminAccessGroup(grupo) {
  return isAdminAccessValue(grupo?.acesso || grupo?.Acesso);
}

function isAdminUser(req) {
  const user = (req && req.user) || {};
  return isAdminAccessValue(user.grupoAcesso || user.Grupo_Acesso);
}

function requireAdmin(req, res) {
  if (!isAdminUser(req)) {
    res.status(403).json({
      status: "erro",
      mensagem: "Apenas administradores podem executar esta acao.",
    });
    return false;
  }
  return true;
}

function sanitizeSegment(value, fallback = "") {
  const out = sanitizePart(value).join("-");
  return out || fallback;
}

function getUploadsRoot() {
  return process.env.UPLOADS_ROOT || path.resolve(__dirname, "../../uploads");
}

async function removeUploadsDirRecursive(dirPath) {
  if (!dirPath) return;
  try {
    const stat = await fs.stat(dirPath).catch(() => null);
    if (!stat) return;
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (err) {
    console.warn("Warning removing uploads directory:", err?.message || err);
  }
}

function qident(name) {
  return `\`${String(name || "").replace(/`/g, "")}\``;
}

async function deleteFromExistingTable(req, tableName, whereClause, values) {
  if (!(await tableExists(req, tableName))) return { affectedRows: 0 };
  const [result] = await dbFor(req).query(
    `DELETE FROM ${qident(tableName)} WHERE ${whereClause}`,
    values,
  );
  return result;
}

async function deletePetFichasByCliente(req, clienteId) {
  if (
    !clienteId ||
    !(await tableExists(req, "Pet_Fichas")) ||
    !(await tableExists(req, "Pets"))
  ) {
    return { affectedRows: 0 };
  }

  const [result] = await dbFor(req).query(
    `
      DELETE pf
      FROM ${qident("Pet_Fichas")} pf
      INNER JOIN ${qident("Pets")} p ON p.id = pf.pet_id
      WHERE p.cliente_id = ?
    `,
    [clienteId],
  );
  return result;
}

async function removeMelPetHostelUserData(req, user, clienteId) {
  const usuarioId = user?.Usuario_ID || user?.id || null;
  const login = user?.Usuario_Login || user?.login || null;

  if (usuarioId) {
    await deleteFromExistingTable(req, "Documentos", "Usuario_ID = ?", [
      usuarioId,
    ]);
  }

  if (login) {
    await deleteFromExistingTable(req, "Contratos", "Usuario_Login = ?", [
      login,
    ]);
    await deleteFromExistingTable(req, "TelegramUsers", "app_user_login = ?", [
      login,
    ]);
  }

  if (clienteId) {
    await deletePetFichasByCliente(req, clienteId);
    await deleteFromExistingTable(req, "Pets", "cliente_id = ?", [clienteId]);
  }
}

async function removeUserUploadDirs(req, user, id) {
  if (!user) return;

  const grupoNome = user.grupoNome || (await resolveGroupName(req, user.Grupo_ID));
  const safeGroup = sanitizeSegment(grupoNome);
  const safeLogin = sanitizeSegment(user.Usuario_Login, `usuario-${id}`);
  if (!safeLogin) return;

  const uploadsRoot = getUploadsRoot();
  const candidates = new Set();
  if (safeGroup) candidates.add(path.join(uploadsRoot, safeGroup, safeLogin));

  for (const dirPath of candidates) {
    await removeUploadsDirRecursive(dirPath);
  }
}

async function ensureGroupDirs(groupName) {
  const safeGroup = sanitizeSegment(groupName);
  if (!safeGroup) return;
  const groupDir = path.join(getUploadsRoot(), safeGroup);
  await fs.mkdir(groupDir, { recursive: true });
}

async function ensureUserDir({ login, grupoNome }) {
  const safeLogin = sanitizeSegment(login, "usuario");
  if (!safeLogin) return;

  const root = getUploadsRoot();

  const safeGroup = sanitizeSegment(grupoNome);
  if (safeGroup) {
    await fs.mkdir(path.join(root, safeGroup, safeLogin), { recursive: true });
  }
}

async function resolveGroupRecord(req, groupValue) {
  const value = clean(groupValue);
  if (!value) return null;
  if (isNumeric(value)) return Grupo.findById(req, Number(value));
  return Grupo.findByName(req, value);
}

async function resolveGroupName(req, groupValue) {
  const value = clean(groupValue);
  if (!value) return null;

  if (isNumeric(value)) {
    const group = await Grupo.findById(req, Number(value));
    return group ? group.nome || group.Nome_Grupo : null;
  }

  return value;
}

async function resolveGroupId(req, groupValue) {
  const value = clean(groupValue);
  if (!value) return null;
  if (isNumeric(value)) return Number(value);

  const group = await Grupo.findByName(req, value);
  return group ? group.id : null;
}

function parseDbBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === true || value === 1 || value === "1") return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "sim", "s", "yes"].includes(normalized)) return true;
    if (["false", "nao", "n", "no", "0"].includes(normalized)) return false;
  }
  return Boolean(value);
}

function getClientePayload(body = {}) {
  const source =
    body.cliente && typeof body.cliente === "object" ? body.cliente : body;

  return {
    nome: clean(source.nome),
    cpf: clean(source.cpf),
    rg: clean(source.rg),
    data_nascimento: clean(source.data_nascimento),
    telefone: clean(source.telefone),
    whatsapp: clean(source.whatsapp),
    email: clean(source.email),
    observacoes: clean(source.observacoes),
    ativo: parseDbBoolean(source.ativo, true),
  };
}

function getEnderecoPayloads(body = {}) {
  const source =
    body.cliente && typeof body.cliente === "object" ? body.cliente : body;

  return Array.isArray(source.enderecos) ? source.enderecos : [];
}

function hasClientePayload(body = {}) {
  if (body.cliente && typeof body.cliente === "object") return true;

  return [
    "nome",
    "cpf",
    "rg",
    "data_nascimento",
    "telefone",
    "whatsapp",
    "email",
    "observacoes",
  ].some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

function requireValidClientePayload(payload, res) {
  const mensagem = getClientFieldValidationMessage(payload);
  if (mensagem) {
    res.status(400).json({ status: "erro", mensagem });
    return false;
  }
  return true;
}

function requireValidEnderecoPayloads(addresses, res) {
  const mensagem = Endereco.getListValidationMessage(addresses);
  if (mensagem) {
    res.status(400).json({ status: "erro", mensagem });
    return false;
  }
  return true;
}

function requireCompleteClienteCadastro(payload, enderecos, res) {
  const mensagem = getClienteCadastroValidationMessage(payload, enderecos);
  if (mensagem) {
    res.status(400).json({ status: "erro", mensagem });
    return false;
  }
  return true;
}

async function attachEnderecosToCliente(req, cliente) {
  if (!cliente || !cliente.id) return cliente;
  return {
    ...cliente,
    enderecos: await Endereco.listByCliente(req, cliente.id),
  };
}

function buildClienteProfileResponse(cliente) {
  const cadastro = getClienteCadastroStatus(cliente, cliente?.enderecos);
  return {
    cliente,
    pendente: cadastro.pendente,
    cadastroCompleto: cadastro.completo,
    pendencias: cadastro.pendencias,
    enderecoPrincipal: cadastro.enderecoPrincipal,
  };
}

async function attachEnderecosToUser(req, user) {
  if (!user || !user.cliente) return user;
  return {
    ...user,
    cliente: await attachEnderecosToCliente(req, user.cliente),
  };
}

async function attachEnderecosToUsers(req, users) {
  return Promise.all(
    (users || []).map((user) => attachEnderecosToUser(req, user)),
  );
}

function userNeedsFirstAccess(row) {
  if (!row) return false;
  return Boolean(
    row.Primeiro_Acesso == 1 ||
    row.primeiro_acesso == 1 ||
    row.primeiroAcesso == 1 ||
    row.PrimeiroAcesso == 1 ||
    row.senha_provisoria == 1 ||
    row.senhaProvisoria == 1,
  );
}

function createTokenPayload({ row, source, grupo, grupoNome, grupoAcesso }) {
  const admin = isAdminAccessValue(grupoAcesso);

  return {
    id: row.Usuario_ID,
    login: row.Usuario_Login,
    grupo: grupo || null,
    grupoNome: grupoNome || null,
    grupoAcesso: grupoAcesso || null,
    admin,
    source,
    modules: [DEFAULT_MODULE],
  };
}

function getPasswordHash(row) {
  return row && (row.Usuario_Senha || row.usuario_senha);
}

function buildReservedClientePayload(login) {
  return {
    nome: `Cadastro pendente - ${clean(login) || "usuario"}`,
    observacoes: null,
    ativo: true,
  };
}

function requireAuthenticatedUser(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ status: "erro", mensagem: "Token nao fornecido" });
    return null;
  }

  try {
    return jwt.verify(authHeader.replace("Bearer ", ""), JWT_SECRET);
  } catch {
    res.status(401).json({ status: "erro", mensagem: "Token invalido" });
    return null;
  }
}

router.get("/login", (req, res) => {
  res.json({
    status: "info",
    mensagem: "Envie POST /auth/login com JSON { login, senha }",
  });
});

router.post("/login", async (req, res) => {
  try {
    const login = clean(req.body?.login);
    const senha = clean(req.body?.senha);

    if (!login || !senha) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Login e senha sao obrigatorios",
      });
    }

    const match = await Usuario.findByLogin(req, login);
    const source = match ? "usuarios" : null;

    if (!match) {
      return res
        .status(401)
        .json({ status: "erro", mensagem: "Usuário ou senha inválidos" });
    }

    if (match.ativo === false || match.ativo === 0) {
      return res
        .status(403)
        .json({ status: "erro", mensagem: "Usuário inativo" });
    }

    const passwordHash = getPasswordHash(match);
    if (!passwordHash) {
      return res.status(500).json({
        status: "erro",
        mensagem: "Cadastro do usuario sem senha cadastrada.",
      });
    }

    const senhaValida = await bcrypt.compare(senha, passwordHash);
    if (!senhaValida) {
      return res
        .status(401)
        .json({ status: "erro", mensagem: "Usuário ou senha inválidos" });
    }

    const grupo = match.Grupo_ID || match.grupo || null;
    const grupoRec = await resolveGroupRecord(req, grupo);
    const grupoNome = match.grupoNome || grupoRec?.nome || grupoRec?.Nome_Grupo || (await resolveGroupName(req, grupo));
    const grupoAcesso = match.grupoAcesso || grupoRec?.acesso || grupoRec?.Acesso || null;
    const admin = isAdminAccessValue(grupoAcesso);

    await ensureUserDir({
      login: match.Usuario_Login,
      grupoNome,
      admin,
    });

    let cadastro = { pendente: false, completo: true };
    if (source === "usuarios") {
      const enderecos = await Endereco.listByCliente(
        req,
        match.Cliente_ID || match.clienteId,
      );
      cadastro = getClienteCadastroStatus(match.cliente, enderecos);
    }
    const payload = createTokenPayload({
      row: match,
      source,
      grupo,
      grupoNome,
      grupoAcesso,
    });
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });

    notifyMelPetHostelLoginAccess(req, match.Usuario_Login).catch((error) => {
      console.error(
        "Erro ao enviar aviso de login no Telegram:",
        error?.message || error,
      );
    });

    res.json({
      status: "sucesso",
      mensagem: "Login realizado com sucesso",
      token,
      usuario: {
        id: match.Usuario_ID,
        login: match.Usuario_Login,
        grupo: grupo || null,
        grupoNome: grupoNome || null,
        grupoAcesso: grupoAcesso || null,
        clienteId: match.Cliente_ID || match.clienteId || null,
        clienteCadastroPendente: Boolean(cadastro.pendente),
        cadastroCompleto: Boolean(cadastro.completo),
        admin,
        source,
        modules: [DEFAULT_MODULE],
        primeiroAcesso: userNeedsFirstAccess(match),
      },
    });
  } catch (error) {
    console.error("Error in /auth/login:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.get("/verificar", (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res
        .status(401)
        .json({ status: "erro", mensagem: "Token nao fornecido" });
    }

    const token = authHeader.replace("Bearer ", "");
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ status: "sucesso", usuario: decoded });
  } catch (error) {
    console.error("Error in /auth/verificar:", error);
    res.status(401).json({ status: "erro", mensagem: "Token invalido" });
  }
});

router.post("/renovar", (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ status: "erro", mensagem: "Token nao fornecido" });
    }

    const token = authHeader.replace("Bearer ", "");
    const decoded = jwt.verify(token, JWT_SECRET);
    const claims = { ...decoded };
    delete claims.exp;
    delete claims.iat;
    const newToken = jwt.sign(claims, JWT_SECRET, { expiresIn: "1h" });
    res.json({ status: "sucesso", token: newToken });
  } catch {
    res
      .status(401)
      .json({ status: "erro", mensagem: "Token invalido ou expirado" });
  }
});

router.post("/alterar-senha", async (req, res) => {
  try {
    const { senhaAtual, novaSenha, confirmarSenha } = req.body || {};
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res
        .status(401)
        .json({ status: "erro", mensagem: "Token nao fornecido" });
    }

    const decoded = jwt.verify(authHeader.replace("Bearer ", ""), JWT_SECRET);

    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Todos os campos sao obrigatorios",
      });
    }

    if (novaSenha !== confirmarSenha) {
      return res.status(400).json({
        status: "erro",
        mensagem: "As senhas não coincidem",
      });
    }

    if (String(novaSenha).length < 6) {
      return res.status(400).json({
        status: "erro",
        mensagem: "A nova senha deve ter pelo menos 6 caracteres",
      });
    }

    const usuario = await Usuario.findById(req, decoded.id);

    if (!usuario) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Usuario nao encontrado" });
    }

    const passwordHash = getPasswordHash(usuario);
    if (!passwordHash) {
      return res.status(500).json({
        status: "erro",
        mensagem: "Cadastro do usuario sem senha cadastrada.",
      });
    }

    const senhaValida = await bcrypt.compare(String(senhaAtual), passwordHash);
    if (!senhaValida) {
      return res
        .status(401)
        .json({ status: "erro", mensagem: "Senha atual incorreta" });
    }

    const senhaHash = await bcrypt.hash(String(novaSenha), 10);
    await Usuario.updatePassword(req, decoded.id, senhaHash, {
      primeiroAcesso: false,
    });

    res.json({ status: "sucesso", mensagem: "Senha alterada com sucesso" });
  } catch (error) {
    console.error("Error in /auth/alterar-senha:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.get("/me/cliente", async (req, res) => {
  try {
    const decoded = requireAuthenticatedUser(req, res);
    if (!decoded) return;

    if (decoded.source !== "usuarios") {
      return res.status(400).json({
        status: "erro",
        mensagem: "Cadastro de cliente indisponivel para este usuario.",
      });
    }

    const usuario = await Usuario.findById(req, decoded.id);
    if (!usuario) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Usuario nao encontrado" });
    }

    let cliente = usuario.cliente || null;
    if (!cliente) {
      cliente = await Cliente.create(
        req,
        buildReservedClientePayload(usuario.Usuario_Login),
      );
      await Usuario.update(req, usuario.Usuario_ID, {
        login: usuario.Usuario_Login,
        grupoId: usuario.Grupo_ID,
        clienteId: cliente.id,
      });
    }

    cliente = await attachEnderecosToCliente(req, cliente);

    res.json({
      status: "sucesso",
      ...buildClienteProfileResponse(cliente),
    });
  } catch (error) {
    console.error("Error in GET /auth/me/cliente:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.put("/me/cliente", async (req, res) => {
  try {
    const decoded = requireAuthenticatedUser(req, res);
    if (!decoded) return;

    if (decoded.source !== "usuarios") {
      return res.status(400).json({
        status: "erro",
        mensagem: "Cadastro de cliente indisponivel para este usuario.",
      });
    }

    const usuario = await Usuario.findById(req, decoded.id);
    if (!usuario) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Usuario nao encontrado" });
    }

    const payload = getClientePayload(req.body || {});
    const enderecos = getEnderecoPayloads(req.body || {});
    if (!payload.nome) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Nome e obrigatorio" });
    }
    if (!requireValidClientePayload(payload, res)) return;
    if (!requireValidEnderecoPayloads(enderecos, res)) return;
    if (!requireCompleteClienteCadastro(payload, enderecos, res)) return;

    let clienteId = usuario.Cliente_ID || null;
    if (clienteId) {
      await Cliente.update(req, clienteId, payload);
    } else {
      const cliente = await Cliente.create(req, payload);
      clienteId = cliente.id;
      await Usuario.update(req, usuario.Usuario_ID, {
        login: usuario.Usuario_Login,
        grupoId: usuario.Grupo_ID,
        clienteId,
      });
    }

    await Endereco.replaceForCliente(req, clienteId, enderecos);
    await ensureUserDocumentStorage(req, usuario.Usuario_Login);
    const cliente = await attachEnderecosToCliente(
      req,
      await Cliente.findById(req, clienteId),
    );
    res.json({
      status: "sucesso",
      mensagem: "Cadastro atualizado",
      ...buildClienteProfileResponse(cliente),
    });
  } catch (error) {
    console.error("Error in PUT /auth/me/cliente:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.get("/groups", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    return res.json(await Grupo.list(req));
  } catch (error) {
    console.error("Error in GET /auth/groups:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post("/groups", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const nome = clean(req.body?.nome);
    const acesso = clean(req.body?.acesso || "usuario");

    if (!nome) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Nome e obrigatorio" });
    }

    const group = await Grupo.create(req, nome, acesso);
    await ensureGroupDirs(group.nome);
    return res.json({ status: "sucesso", mensagem: "Grupo criado", group });
  } catch (error) {
    console.error("Error in POST /auth/groups:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.get("/users", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const users = await Usuario.list(req);
    return res.json(await attachEnderecosToUsers(req, users));
  } catch (error) {
    console.error("Error in GET /auth/users:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post("/users", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const login = clean(req.body?.login);
    const senhaProvisoria = clean(req.body?.senhaProvisoria);
    const grupo = req.body?.grupo;
    const ativo = parseDbBoolean(req.body?.ativo, true);

    if (!login || !senhaProvisoria || !grupo) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Login, senha provisória e grupo são obrigatórios",
      });
    }

    const existingUser = await Usuario.findByLogin(req, login);
    if (existingUser) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Usuario ja existe" });
    }

    const grupoId = await resolveGroupId(req, grupo);
    if (!grupoId) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Grupo invalido" });
    }

    const grupoRec = await Grupo.findById(req, grupoId);
    const grupoNome = grupoRec && (grupoRec.nome || grupoRec.Nome_Grupo);
    const isAdministrator = isAdminAccessGroup(grupoRec);
    const clientePayload = getClientePayload(req.body || {});
    const enderecos = getEnderecoPayloads(req.body || {});
    let cliente;

    if (isAdministrator) {
      if (!clientePayload.nome) {
        return res.status(400).json({
          status: "erro",
          mensagem: "Nome do cliente e obrigatorio para administradores.",
        });
      }
      if (!requireValidClientePayload(clientePayload, res)) return;
      if (!requireValidEnderecoPayloads(enderecos, res)) return;
      if (!requireCompleteClienteCadastro(clientePayload, enderecos, res)) {
        return;
      }

      cliente = await Cliente.create(req, clientePayload);
      await Endereco.replaceForCliente(req, cliente.id, enderecos);
    } else {
      cliente = await Cliente.create(req, buildReservedClientePayload(login));
    }

    const senhaHash = await bcrypt.hash(senhaProvisoria, 10);
    const created = await Usuario.create(req, {
      login,
      senhaHash,
      grupoId,
      clienteId: cliente.id,
      primeiroAcesso: isAdministrator ? 0 : 1,
      ativo,
    });

    await ensureUserDir({
      login,
      grupoNome,
      admin: isAdministrator,
    });

    return res.json({
      status: "sucesso",
      mensagem: "Usuario criado",
      user: await attachEnderecosToUser(req, created),
    });
  } catch (error) {
    console.error("Error in POST /auth/users:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.put("/users/:id", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.params.id);
    const login = clean(req.body?.login);
    const grupo = req.body?.grupo;
    const hasAtivo = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "ativo",
    );

    if (!id || !login || !grupo) {
      return res.status(400).json({
        status: "erro",
        mensagem: "ID, login e grupo sao obrigatorios",
      });
    }

    const currentUser = await Usuario.findById(req, id);
    if (!currentUser) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Usuario nao encontrado" });
    }

    const existingUser = await Usuario.findByLogin(req, login);

    if (existingUser && Number(existingUser.Usuario_ID) !== id) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Usuario ja existe" });
    }

    const grupoId = await resolveGroupId(req, grupo);
    if (!grupoId) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Grupo invalido" });
    }

    const grupoRec = await Grupo.findById(req, grupoId);
    const grupoNome = grupoRec && (grupoRec.nome || grupoRec.Nome_Grupo);
    const isAdministrator = isAdminAccessGroup(grupoRec);
    const shouldUpdateCliente = hasClientePayload(req.body || {});
    const clientePayload = shouldUpdateCliente
      ? getClientePayload(req.body || {})
      : null;
    const enderecos = getEnderecoPayloads(req.body || {});
    let clienteId = currentUser.Cliente_ID || null;

    if (isAdministrator) {
      if ((!clientePayload || !clientePayload.nome) && !clienteId) {
        return res.status(400).json({
          status: "erro",
          mensagem: "Nome do cliente e obrigatorio para administradores",
        });
      }
      if (clientePayload && !requireValidClientePayload(clientePayload, res)) {
        return;
      }
      if (!requireValidEnderecoPayloads(enderecos, res)) return;
      if (
        clientePayload &&
        !requireCompleteClienteCadastro(clientePayload, enderecos, res)
      ) {
        return;
      }

      if (clienteId && shouldUpdateCliente) {
        await Cliente.update(req, clienteId, clientePayload);
      } else if (!clienteId && clientePayload) {
        const cliente = await Cliente.create(req, clientePayload);
        clienteId = cliente.id;
      }

      if (clienteId) {
        await Endereco.replaceForCliente(req, clienteId, enderecos);
      }
    }

    const result = await Usuario.update(req, id, {
      login,
      grupoId,
      clienteId,
      ativo: hasAtivo ? parseDbBoolean(req.body?.ativo, true) : undefined,
    });

    if (!result || result.affectedRows === 0) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Usuario nao encontrado" });
    }

    await ensureUserDir({
      login,
      grupoNome,
      admin: isAdministrator,
    });

    return res.json({
      status: "sucesso",
      mensagem: "Usuario atualizado",
      user: await attachEnderecosToUser(req, await Usuario.findById(req, id)),
    });
  } catch (error) {
    console.error("Error in PUT /auth/users/:id:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.put("/users/:id/password", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.params.id);
    const novaSenha = clean(req.body?.novaSenha);
    const primeiroAcesso = parseDbBoolean(req.body?.primeiroAcesso, false);

    if (!id || !novaSenha || novaSenha.length < 6) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Informe uma senha com pelo menos 6 caracteres",
      });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 10);
    const result = await Usuario.updatePassword(req, id, senhaHash, {
      primeiroAcesso,
    });

    if (!result || result.affectedRows === 0) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Usuario nao encontrado" });
    }

    res.json({ status: "sucesso", mensagem: "Senha alterada" });
  } catch (error) {
    console.error("Error in PUT /auth/users/:id/password:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.delete("/groups/:id", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = req.params.id;

    if (!id) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "ID e obrigatorio" });
    }

    const group = await Grupo.findById(req, id);
    if (!group) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Grupo nao encontrado" });
    }

    await Usuario.removeByGroup(req, id);
    await Grupo.remove(req, id);
    await removeUploadsDirRecursive(
      path.join(getUploadsRoot(), sanitizeSegment(group.nome)),
    );

    res.json({ status: "sucesso", mensagem: "Grupo removido" });
  } catch (error) {
    console.error("Error in DELETE /auth/groups/:id:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.params.id);

    if (!id) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "ID e obrigatorio" });
    }

    const user = await Usuario.findById(req, id);
    if (!user) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Usuario nao encontrado" });
    }

    const clienteId = user?.Cliente_ID || user?.clienteId || null;

    await removeMelPetHostelUserData(req, user, clienteId);
    await Usuario.remove(req, id);

    if (clienteId) {
      await Endereco.removeByCliente(req, clienteId);
      await Cliente.remove(req, clienteId);
    }

    await removeUserUploadDirs(req, user, id);

    res.json({ status: "sucesso", mensagem: "Usuario removido" });
  } catch (error) {
    console.error("Error in DELETE /auth/users/:id:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

module.exports = router;
