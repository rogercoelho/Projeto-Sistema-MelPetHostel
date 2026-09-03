const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const {
  TABLE_NAMES,
  dbFor,
  getUsuarioLoginByClienteId,
  movePetDocumentsToExpurgo,
  parseJsonArray,
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

function isAdminAccessValue(value) {
  return String(value || "").toLowerCase() === "adm";
}

function normalizeDateOnly(value) {
  if (!value) return "";
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
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
  const fichasTable = await resolveTableName(req, TABLE_NAMES.petFichas);

  const placeholders = clienteIds.map(() => "?").join(", ");
  const [rows] = await dbFor(req).query(
    `
      SELECT
        p.id, p.cliente_id, p.nome, p.raca, p.data_nascimento, p.peso_aproximado, p.ativo,
        f.veterinario_nome, f.clinica_nome, f.clinica_telefone, f.clinica_endereco,
        f.autoriza_atendimento_emergencial, f.autoriza_medicacao, f.sexo, f.castrado,
        f.doenca_diagnosticada, f.doenca_detalhes, f.cirurgias_historico, f.cirurgias_detalhes,
        f.medicamento_continuo, f.medicamento_detalhes, f.alimentacao_tipos, f.alimentacao_marca,
        f.alimentacao_quantidade_horarios, f.restricoes_alimentares, f.deixa_mexer_potinho,
        f.petiscos, f.comportamento_caes, f.agressividade, f.agressividade_situacoes,
        f.destroi_objetos, f.ansiedade_separacao, f.medos_especificos, f.reacao_medo,
        f.como_acalmar, f.fica_sozinho, f.tempo_sozinho, f.local_dormir,
        f.ritual_dormir_comer, f.aceita_banho_escovacao, f.aceita_roupinha,
        f.permite_manuseio, f.gosta_colo, f.sensibilidade_fisica, f.sensibilidade_detalhes,
        f.brinca_piscina, f.brinca_mangueira, f.brinca_bolinha, f.brinca_madeira,
        f.observacoes_tutor, f.data_nascimento AS ficha_data_nascimento, f.veracidade_informacoes
      FROM ${qtable(tableName)} p
      ${fichasTable ? `LEFT JOIN ${qtable(fichasTable)} f ON f.pet_id = p.id` : ""}
      WHERE p.${qcol("cliente_id")} IN (${placeholders})
      ORDER BY p.${qcol("nome")} ASC, p.${qcol("id")} ASC
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
      dataNascimento: normalizeDateOnly(row.data_nascimento),
      pesoAproximado: row.peso_aproximado || "",
      ativo: row.ativo === undefined || row.ativo === null ? true : row.ativo == 1,
      ficha: {
        nomePet: row.nome || "",
        raca: row.raca || "",
        dataNascimento: normalizeDateOnly(row.ficha_data_nascimento || row.data_nascimento),
        pesoAproximado: row.peso_aproximado || "",
        veterinarioNome: row.veterinario_nome || "",
        clinicaNome: row.clinica_nome || "",
        clinicaTelefone: row.clinica_telefone || "",
        clinicaEndereco: row.clinica_endereco || "",
        autorizaAtendimentoEmergencial: row.autoriza_atendimento_emergencial || "",
        autorizaMedicacao: row.autoriza_medicacao || "",
        sexo: row.sexo || "",
        castrado: row.castrado || "",
        doencaDiagnosticada: row.doenca_diagnosticada || "",
        doencaDetalhes: row.doenca_detalhes || "",
        cirurgiasHistorico: row.cirurgias_historico || "",
        cirurgiasDetalhes: row.cirurgias_detalhes || "",
        medicamentoContinuo: row.medicamento_continuo || "",
        medicamentoDetalhes: row.medicamento_detalhes || "",
        alimentacaoTipos: parseJsonArray(row.alimentacao_tipos),
        alimentacaoMarca: row.alimentacao_marca || "",
        alimentacaoQuantidadeHorarios: row.alimentacao_quantidade_horarios || "",
        restricoesAlimentares: row.restricoes_alimentares || "",
        deixaMexerPotinho: row.deixa_mexer_potinho || "",
        petiscos: row.petiscos || "",
        comportamentoCaes: row.comportamento_caes || "",
        agressividade: row.agressividade || "",
        agressividadeSituacoes: row.agressividade_situacoes || "",
        destroiObjetos: row.destroi_objetos || "",
        ansiedadeSeparacao: row.ansiedade_separacao || "",
        medosEspecificos: row.medos_especificos || "",
        reacaoMedo: row.reacao_medo || "",
        comoAcalmar: row.como_acalmar || "",
        ficaSozinho: row.fica_sozinho || "",
        tempoSozinho: row.tempo_sozinho || "",
        localDormir: row.local_dormir || "",
        ritualDormirComer: row.ritual_dormir_comer || "",
        aceitaBanhoEscovacao: row.aceita_banho_escovacao || "",
        aceitaRoupinha: row.aceita_roupinha || "",
        permiteManuseio: row.permite_manuseio || "",
        gostaColo: row.gosta_colo || "",
        sensibilidadeFisica: row.sensibilidade_fisica || "",
        sensibilidadeDetalhes: row.sensibilidade_detalhes || "",
        brincaPiscina: row.brinca_piscina || "",
        brincaMangueira: row.brinca_mangueira || "",
        brincaBolinha: row.brinca_bolinha || "",
        brincaMadeira: row.brinca_madeira || "",
        observacoesTutor: row.observacoes_tutor || "",
        veracidadeInformacoes: Boolean(row.veracidade_informacoes),
      },
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
      return isAdminAccessValue(usuario?.grupoAcesso || usuario?.Grupo_Acesso || usuario?.acesso);
    })
    .map((usuario) => usuario?.Cliente_ID || usuario?.clienteId)
    .filter(Boolean);

  return new Set(adminClienteIds);
}

async function listUsuariosByClienteIds(req, clienteIds) {
  if (!clienteIds.length) return new Map();

  const clienteIdSet = new Set(clienteIds.map((id) => String(id)));
  const usuarios = await Usuario.list(req);
  const byCliente = new Map();

  for (const usuario of usuarios || []) {
    const clienteId = usuario?.Cliente_ID || usuario?.clienteId;
    if (!clienteIdSet.has(String(clienteId))) continue;

    const current = byCliente.get(Number(clienteId));
    const isAdmin = isAdminAccessValue(usuario?.grupoAcesso || usuario?.Grupo_Acesso || usuario?.acesso);
    if (!current || (current.admin && !isAdmin)) {
      byCliente.set(Number(clienteId), {
        usuarioId: usuario?.Usuario_ID || usuario?.id || null,
        usuarioLogin: usuario?.Usuario_Login || usuario?.login || "",
        admin: isAdmin,
      });
    }
  }

  return byCliente;
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
    const usuariosByCliente = await listUsuariosByClienteIds(req, clienteIds);

    return res.json({
      status: "sucesso",
      clientes: clientes.map((cliente) => ({
        ...cliente,
        admin: adminClienteIds.has(cliente.id),
        usuarioId: usuariosByCliente.get(cliente.id)?.usuarioId || null,
        usuarioLogin: usuariosByCliente.get(cliente.id)?.usuarioLogin || "",
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
                SET conferido_at = NULL,
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
    const acesso = clean(req.body?.acesso || "usuario");
    if (!nome || !nome.trim())
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Nome é obrigatório" });

    await Grupo.create(req, nome.trim(), acesso);

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
