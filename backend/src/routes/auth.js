const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs").promises;
const { sanitizePart } = require("../utils/uploadsUtils");
const {
  AdminUsuario,
  MelPetHostelGrupo,
  MelPetHostelUsuario,
} = require("../models");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const DEFAULT_MODULE = "melpethostel";
const ADMIN_MODULE = "administradores";

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function isNumeric(value) {
  return /^\d+$/.test(clean(value));
}

function isAdminGroupValue(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .includes("admin");
}

function isAdminUser(req) {
  const user = (req && req.user) || {};
  const values = [
    user.grupoNome,
    user.grupo,
    user.perfil,
    user.role,
    user.tipo,
  ];

  return Boolean(
    user.admin ||
      user.isAdmin ||
      user.source === "usuarios" ||
      values.some((value) => isAdminGroupValue(value)),
  );
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

function getModulo(req) {
  const value = clean(req.query?.modulo || req.body?.modulo || DEFAULT_MODULE)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return value || DEFAULT_MODULE;
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

async function ensureGroupDirs(groupName) {
  const safeGroup = sanitizeSegment(groupName);
  if (!safeGroup) return;
  const groupDir = path.join(getUploadsRoot(), safeGroup);
  await fs.mkdir(groupDir, { recursive: true });
}

async function ensureUserDir({ login, grupoNome, admin = false }) {
  const safeLogin = sanitizeSegment(login, "usuario");
  if (!safeLogin) return;

  const root = getUploadsRoot();
  if (admin) {
    await fs.mkdir(path.join(root, "Administradores", safeLogin), {
      recursive: true,
    });
    return;
  }

  const safeGroup = sanitizeSegment(grupoNome);
  if (safeGroup) {
    await fs.mkdir(path.join(root, safeGroup, safeLogin), { recursive: true });
  }
}

async function resolveMelPetHostelGroupName(req, groupValue) {
  const value = clean(groupValue);
  if (!value) return null;

  if (isNumeric(value)) {
    const group = await MelPetHostelGrupo.findById(req, Number(value));
    return group ? group.Grupo_Nome : null;
  }

  return value;
}

async function resolveMelPetHostelGroupId(req, groupValue) {
  const value = clean(groupValue);
  if (!value) return null;
  if (isNumeric(value)) return Number(value);

  const group = await MelPetHostelGrupo.findByName(req, value);
  return group ? group.Grupo_ID : null;
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

function createTokenPayload({ row, source, grupo, grupoNome }) {
  return {
    id: row.Usuario_ID,
    login: row.Usuario_Login,
    grupo: grupo || null,
    grupoNome: grupoNome || null,
    source,
    modules: [DEFAULT_MODULE],
  };
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

    let match = await AdminUsuario.findByLogin(req, login);
    let source = match ? "usuarios" : null;

    if (!match) {
      match = await MelPetHostelUsuario.findByLogin(req, login);
      source = match ? DEFAULT_MODULE : null;
    }

    if (!match) {
      return res
        .status(401)
        .json({ status: "erro", mensagem: "Usuario ou senha invalidos" });
    }

    const senhaValida = await bcrypt.compare(senha, match.Usuario_Senha);
    if (!senhaValida) {
      return res
        .status(401)
        .json({ status: "erro", mensagem: "Usuario ou senha invalidos" });
    }

    const grupo = match.Grupo_ID || match.Usuario_Grupo || null;
    const grupoNome =
      source === "usuarios"
        ? clean(match.Usuario_Grupo) || "Administradores"
        : await resolveMelPetHostelGroupName(req, grupo);

    await ensureUserDir({
      login: match.Usuario_Login,
      grupoNome,
      admin: source === "usuarios" || isAdminGroupValue(grupoNome),
    });

    const payload = createTokenPayload({ row: match, source, grupo, grupoNome });
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });

    res.json({
      status: "sucesso",
      mensagem: "Login realizado com sucesso",
      token,
      usuario: {
        id: match.Usuario_ID,
        login: match.Usuario_Login,
        grupo: grupo || null,
        grupoNome: grupoNome || null,
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
        mensagem: "As senhas nao coincidem",
      });
    }

    if (String(novaSenha).length < 6) {
      return res.status(400).json({
        status: "erro",
        mensagem: "A nova senha deve ter pelo menos 6 caracteres",
      });
    }

    let usuario = null;
    let source = decoded.source || null;

    if (source === "usuarios") {
      usuario = await AdminUsuario.findById(req, decoded.id);
    } else if (source === DEFAULT_MODULE) {
      usuario = await MelPetHostelUsuario.findById(req, decoded.id);
    }

    if (!usuario) {
      usuario =
        (await AdminUsuario.findById(req, decoded.id)) ||
        (await MelPetHostelUsuario.findById(req, decoded.id));
      source = usuario && isAdminGroupValue(usuario.Usuario_Grupo)
        ? "usuarios"
        : DEFAULT_MODULE;
    }

    if (!usuario) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Usuario nao encontrado" });
    }

    const senhaValida = await bcrypt.compare(
      String(senhaAtual),
      usuario.Usuario_Senha,
    );
    if (!senhaValida) {
      return res
        .status(401)
        .json({ status: "erro", mensagem: "Senha atual incorreta" });
    }

    const senhaHash = await bcrypt.hash(String(novaSenha), 10);
    if (source === "usuarios") {
      await AdminUsuario.updatePassword(req, decoded.id, senhaHash);
    } else {
      await MelPetHostelUsuario.updatePassword(req, decoded.id, senhaHash);
    }

    res.json({ status: "sucesso", mensagem: "Senha alterada com sucesso" });
  } catch (error) {
    console.error("Error in /auth/alterar-senha:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.get("/groups", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const modulo = getModulo(req);

    if (modulo === DEFAULT_MODULE) {
      return res.json(await MelPetHostelGrupo.list(req));
    }

    if (modulo === ADMIN_MODULE) {
      return res.json(await AdminUsuario.listAdminGroups(req));
    }

    return res
      .status(400)
      .json({ status: "erro", mensagem: "Modulo nao suportado" });
  } catch (error) {
    console.error("Error in GET /auth/groups:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post("/groups", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const nome = clean(req.body?.nome);
    const modulo = getModulo(req);

    if (!nome) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Nome e obrigatorio" });
    }

    if (modulo === DEFAULT_MODULE) {
      const group = await MelPetHostelGrupo.create(req, nome);
      await ensureGroupDirs(group.Grupo_Nome);
      return res.json({ status: "sucesso", mensagem: "Grupo criado", group });
    }

    if (modulo === ADMIN_MODULE) {
      return res.json({
        status: "sucesso",
        mensagem: "Use o grupo Administradores ao criar usuarios admin.",
      });
    }

    return res
      .status(400)
      .json({ status: "erro", mensagem: "Modulo nao suportado" });
  } catch (error) {
    console.error("Error in POST /auth/groups:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.get("/users", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const modulo = getModulo(req);

    if (modulo === DEFAULT_MODULE) {
      return res.json(await MelPetHostelUsuario.list(req));
    }

    if (modulo === ADMIN_MODULE) {
      return res.json(await AdminUsuario.listAdmins(req));
    }

    return res
      .status(400)
      .json({ status: "erro", mensagem: "Modulo nao suportado" });
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
    const modulo = getModulo(req);

    if (!login || !senhaProvisoria) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Login e senha provisoria sao obrigatorios",
      });
    }

    const existingAdmin = await AdminUsuario.findByLogin(req, login);
    const existingMelPetHostel = await MelPetHostelUsuario.findByLogin(
      req,
      login,
    );
    if (existingAdmin || existingMelPetHostel) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Usuario ja existe" });
    }

    const senhaHash = await bcrypt.hash(senhaProvisoria, 10);

    if (modulo === DEFAULT_MODULE) {
      const grupoId = await resolveMelPetHostelGroupId(req, grupo);
      if (!grupoId) {
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Grupo invalido" });
      }

      const grupoRec = await MelPetHostelGrupo.findById(req, grupoId);
      const created = await MelPetHostelUsuario.create(req, {
        login,
        senhaHash,
        grupoId,
        grupoNome: grupoRec && grupoRec.Grupo_Nome,
      });
      await ensureUserDir({
        login,
        grupoNome: grupoRec && grupoRec.Grupo_Nome,
      });
      return res.json({
        status: "sucesso",
        mensagem: "Usuario criado",
        user: created,
      });
    }

    if (modulo === ADMIN_MODULE) {
      const groupName = clean(grupo) || "Administradores";
      const created = await AdminUsuario.create(req, {
        login,
        senhaHash,
        grupo: groupName,
      });
      await ensureUserDir({ login, grupoNome: groupName, admin: true });
      return res.json({
        status: "sucesso",
        mensagem: "Usuario criado",
        user: created,
      });
    }

    return res
      .status(400)
      .json({ status: "erro", mensagem: "Modulo nao suportado" });
  } catch (error) {
    console.error("Error in POST /auth/users:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.put("/users/:id/password", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.params.id);
    const novaSenha = clean(req.body?.novaSenha);
    const modulo = getModulo(req);

    if (!id || !novaSenha || novaSenha.length < 6) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Informe uma senha com pelo menos 6 caracteres",
      });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 10);
    let result;

    if (modulo === ADMIN_MODULE) {
      result = await AdminUsuario.updatePassword(req, id, senhaHash);
    } else {
      result = await MelPetHostelUsuario.updatePassword(req, id, senhaHash);
    }

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
    const modulo = getModulo(req);

    if (!id) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "ID e obrigatorio" });
    }

    if (modulo === ADMIN_MODULE) {
      await AdminUsuario.removeAllAdmins(req);
      await removeUploadsDirRecursive(
        path.join(getUploadsRoot(), "Administradores"),
      );
      return res.json({ status: "sucesso", mensagem: "Grupo removido" });
    }

    if (modulo !== DEFAULT_MODULE) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Modulo nao suportado" });
    }

    const group = await MelPetHostelGrupo.findById(req, id);
    if (!group) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Grupo nao encontrado" });
    }

    await MelPetHostelUsuario.removeByGroup(req, {
      grupoId: id,
      grupoNome: group.Grupo_Nome,
    });
    await MelPetHostelGrupo.remove(req, id);
    await removeUploadsDirRecursive(
      path.join(getUploadsRoot(), sanitizeSegment(group.Grupo_Nome)),
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
    const modulo = getModulo(req);

    if (!id) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "ID e obrigatorio" });
    }

    if (modulo === ADMIN_MODULE) {
      const user = await AdminUsuario.findById(req, id);
      await AdminUsuario.remove(req, id);
      if (user) {
        await removeUploadsDirRecursive(
          path.join(
            getUploadsRoot(),
            "Administradores",
            sanitizeSegment(user.Usuario_Login, `usuario-${id}`),
          ),
        );
      }
      return res.json({ status: "sucesso", mensagem: "Usuario removido" });
    }

    if (modulo !== DEFAULT_MODULE) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Modulo nao suportado" });
    }

    const user = await MelPetHostelUsuario.findById(req, id);
    await MelPetHostelUsuario.remove(req, id);

    if (user) {
      const grupoNome = await resolveMelPetHostelGroupName(
        req,
        user.Grupo_ID || user.Usuario_Grupo,
      );
      const safeGroup = sanitizeSegment(grupoNome);
      const safeLogin = sanitizeSegment(user.Usuario_Login, `usuario-${id}`);
      if (safeGroup) {
        await removeUploadsDirRecursive(
          path.join(getUploadsRoot(), safeGroup, safeLogin),
        );
      }
    }

    res.json({ status: "sucesso", mensagem: "Usuario removido" });
  } catch (error) {
    console.error("Error in DELETE /auth/users/:id:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

module.exports = router;
