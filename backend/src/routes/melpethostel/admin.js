const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const {
  Grupo,
  Usuario,
  fs,
  path,
} = require("./context");

router.get("/groups", async (req, res) => {
  try {
    const grupos = await Grupo.list(req);
    return res.json(grupos);
  } catch (error) {
    console.error("Error in /melpethostel/groups:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

// Create group

router.post("/groups", async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome || !nome.trim())
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Nome é obrigatório" });

    await Grupo.create(req, nome.trim());

    // create upload folders for the group if not present
    try {
      const uploadsRoot =
        process.env.UPLOADS_ROOT || path.resolve(__dirname, "../../../uploads");
      const safeName = String(nome)
        .trim()
        .replace(/[\\/\\\\:?"<>|*]/g, "-");
      const groupDir = path.join(uploadsRoot, safeName);
      await fs.mkdir(groupDir, { recursive: true });
    } catch (err) {
      console.warn(
        "Warning: failed to create upload dirs for melpethostel group:",
        err?.message || err,
      );
    }

    return res.json({ status: "sucesso", mensagem: "Grupo criado" });
  } catch (error) {
    console.error("Error in POST /melpethostel/groups:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

// List users

router.get("/users", async (req, res) => {
  try {
    const usuarios = await Usuario.list(req);
    return res.json(
      usuarios.map((usuario) => ({
        id: usuario.id,
        login: usuario.login,
        grupo: usuario.grupo,
        Created_At: usuario.created_at,
        Updated_At: usuario.updated_at,
      })),
    );
  } catch (error) {
    console.error("Error in /melpethostel/users:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

// Create user

router.post("/users", async (req, res) => {
  try {
    const { login, grupo, senhaProvisoria } = req.body;
    if (!login || !senhaProvisoria)
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Login e senha são obrigatórios" });

    const senhaHash = await bcrypt.hash(String(senhaProvisoria), 10);
    const grupoId = Number(grupo);

    if (!Number.isInteger(grupoId) || grupoId <= 0) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Grupo invalido" });
    }

    const group = await Grupo.findById(req, grupoId);
    if (!group) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Grupo invalido" });
    }

    await Usuario.create(req, {
      login: login.trim(),
      senhaHash,
      grupoId,
      primeiroAcesso: 1,
      ativo: 1,
    });
    return res.json({ status: "sucesso", mensagem: "Usuário criado" });
  } catch (error) {
    console.error("Error in POST /melpethostel/users:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

module.exports = router;
