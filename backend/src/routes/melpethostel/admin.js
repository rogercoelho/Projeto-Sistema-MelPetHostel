const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const {
  TABLE_NAMES,
  dbFor,
  getUsuarioLoginByClienteId,
  movePetDocumentsToExpurgo,
  qcol,
  qtable,
  resolveTableName,
  Grupo,
  Usuario,
  fs,
  path,
} = require("./context");

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function isNumeric(value) {
  return /^\d+$/.test(clean(value));
}

function isAdminGroupValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .includes("admin");
}

function normalizeCliente(row) {
  return {
    id: row.id,
    nome: row.nome || "",
    cpf: row.cpf || "",
    rg: row.rg || "",
    data_nascimento: row.data_nascimento || null,
    telefone: row.telefone || "",
    whatsapp: row.whatsapp || "",
    email: row.email || "",
    observacoes: row.observacoes || "",
    ativo: row.ativo === undefined || row.ativo === null ? true : row.ativo == 1,
    criado_em: row.criado_em || null,
    atualizado_em: row.atualizado_em || null,
  };
}

function getClienteOrderBy(value) {
  const options = {
    codigo_asc: "c.id ASC",
    codigo_desc: "c.id DESC",
    nome_asc: "c.nome ASC, c.id ASC",
    nome_desc: "c.nome DESC, c.id ASC",
  };
  return options[value] || options.codigo_asc;
}

async function listEnderecosByClienteIds(req, clienteIds) {
  if (!clienteIds.length) return new Map();
  const tableName = await resolveTableName(req, "Enderecos");
  if (!tableName) return new Map();

  const placeholders = clienteIds.map(() => "?").join(", ");
  const [rows] = await dbFor(req).query(
    `
      SELECT *
      FROM ${qtable(tableName)}
      WHERE ${qcol("cliente_id")} IN (${placeholders})
      ORDER BY ${qcol("principal")} DESC, ${qcol("id")} ASC
    `,
    clienteIds,
  );

  const byCliente = new Map();
  for (const row of rows || []) {
    const list = byCliente.get(row.cliente_id) || [];
    list.push(row);
    byCliente.set(row.cliente_id, list);
  }
  return byCliente;
}

async function listPetsByClienteIds(req, clienteIds) {
  if (!clienteIds.length) return new Map();
  const tableName = await resolveTableName(req, TABLE_NAMES.pets);
  if (!tableName) return new Map();

  const placeholders = clienteIds.map(() => "?").join(", ");
  const [rows] = await dbFor(req).query(
    `
      SELECT id, cliente_id, nome, raca, idade, peso_aproximado, ativo
      FROM ${qtable(tableName)}
      WHERE ${qcol("cliente_id")} IN (${placeholders})
      ORDER BY ${qcol("nome")} ASC, ${qcol("id")} ASC
    `,
    clienteIds,
  );

  const byCliente = new Map();
  for (const row of rows || []) {
    const list = byCliente.get(row.cliente_id) || [];
    list.push({
      id: row.id,
      nome: row.nome || "",
      raca: row.raca || "",
      idade: row.idade || "",
      pesoAproximado: row.peso_aproximado || "",
      ativo: row.ativo === undefined || row.ativo === null ? true : row.ativo == 1,
    });
    byCliente.set(row.cliente_id, list);
  }
  return byCliente;
}

async function listAdminClienteIds(req, clienteIds) {
  if (!clienteIds.length) return new Set();

  const clienteIdSet = new Set(clienteIds.map((id) => String(id)));
  const usuarios = await Usuario.list(req);
  const adminClienteIds = (usuarios || [])
    .filter((usuario) => {
      const clienteId = usuario?.Cliente_ID || usuario?.clienteId;
      if (!clienteIdSet.has(String(clienteId))) return false;
      return isAdminGroupValue(usuario?.grupoNome || usuario?.Grupo_Nome);
    })
    .map((usuario) => usuario?.Cliente_ID || usuario?.clienteId)
    .filter(Boolean);

  return new Set(adminClienteIds);
}

router.get("/clientes", async (req, res) => {
  try {
    const tableName = await resolveTableName(req, TABLE_NAMES.clientes);
    if (!tableName) {
      return res
        .status(500)
        .json({ status: "erro", mensagem: "Tabela Clientes nao encontrada." });
    }

    const busca = clean(req.query.busca);
    const ordenar = clean(req.query.ordenar);
    const where = [];
    const values = [];
    const petsTable = await resolveTableName(req, TABLE_NAMES.pets);

    if (busca) {
      const petNameClause = petsTable
        ? ` OR EXISTS (
              SELECT 1
              FROM ${qtable(petsTable)} p
              WHERE p.${qcol("cliente_id")} = c.${qcol("id")}
                AND p.${qcol("nome")} LIKE ?
            )`
        : "";
      if (isNumeric(busca)) {
        where.push(`(c.id = ? OR c.nome LIKE ?${petNameClause})`);
        values.push(Number(busca), `%${busca}%`);
      } else {
        where.push(`(c.nome LIKE ?${petNameClause})`);
        values.push(`%${busca}%`);
      }

      if (petsTable) {
        values.push(`%${busca}%`);
      }
    }

    const [rows] = await dbFor(req).query(
      `
        SELECT c.*
        FROM ${qtable(tableName)} c
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY ${getClienteOrderBy(ordenar)}
      `,
      values,
    );

    const clientes = (rows || []).map(normalizeCliente);
    const clienteIds = clientes.map((cliente) => cliente.id).filter(Boolean);
    const enderecosByCliente = await listEnderecosByClienteIds(req, clienteIds);
    const petsByCliente = await listPetsByClienteIds(req, clienteIds);
    const adminClienteIds = await listAdminClienteIds(req, clienteIds);

    return res.json({
      status: "sucesso",
      clientes: clientes.map((cliente) => ({
        ...cliente,
        admin: adminClienteIds.has(cliente.id),
        enderecos: enderecosByCliente.get(cliente.id) || [],
        pets: petsByCliente.get(cliente.id) || [],
      })),
    });
  } catch (error) {
    console.error("Error in GET /melpethostel/clientes:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.patch("/pets/:petId/status", async (req, res) => {
  try {
    const petId = Number(req.params.petId);
    if (!Number.isInteger(petId) || petId <= 0) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Pet invalido." });
    }

    const tableName = await resolveTableName(req, TABLE_NAMES.pets);
    if (!tableName) {
      return res
        .status(500)
        .json({ status: "erro", mensagem: "Tabela Pets nao encontrada." });
    }

    const [petRows] = await dbFor(req).query(
      `SELECT ${qcol("id")} AS id, ${qcol("cliente_id")} AS clienteId
         FROM ${qtable(tableName)}
        WHERE ${qcol("id")} = ?
        LIMIT 1`,
      [petId],
    );
    const pet = petRows && petRows.length ? petRows[0] : null;
    if (!pet) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Pet nao encontrado." });
    }

    const ativo = Boolean(req.body?.ativo);
    await dbFor(req).beginTransaction();
    let movedDocuments = 0;
    try {
      const [result] = await dbFor(req).query(
        `UPDATE ${qtable(tableName)} SET ${qcol("ativo")} = ? WHERE ${qcol("id")} = ?`,
        [ativo ? 1 : 0, petId],
      );

      if (!result || result.affectedRows === 0) {
        await dbFor(req).rollback();
        return res
          .status(404)
          .json({ status: "erro", mensagem: "Pet nao encontrado." });
      }

      if (!ativo) {
        const login = await getUsuarioLoginByClienteId(req, pet.clienteId);
        movedDocuments = await movePetDocumentsToExpurgo(req, {
          petId,
          clienteId: pet.clienteId,
          login,
        });
      } else {
        const carteirasTable = await resolveTableName(
          req,
          TABLE_NAMES.petCarteirasVacinacao,
        );
        if (carteirasTable) {
          await dbFor(req).query(
            `UPDATE ${qtable(carteirasTable)}
                SET conferido = 0,
                    conferido_at = NULL,
                    conferido_por = NULL,
                    status = 'expurgado'
              WHERE pet_id = ?`,
            [petId],
          );
        }

        const respostasTable = await resolveTableName(
          req,
          TABLE_NAMES.petVacinasRespostas,
        );
        if (respostasTable) {
          await dbFor(req).query(
            `DELETE FROM ${qtable(respostasTable)}
              WHERE pet_id = ?`,
            [petId],
          );
        }
      }

      await dbFor(req).commit();
    } catch (error) {
      await dbFor(req).rollback();
      throw error;
    }

    return res.json({
      status: "sucesso",
      mensagem: ativo ? "Pet ativado com sucesso." : "Pet inativado com sucesso.",
      pet: { id: petId, ativo },
      documentosMovidos: movedDocuments,
    });
  } catch (error) {
    console.error("Error in PATCH /melpethostel/pets/:petId/status:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

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
