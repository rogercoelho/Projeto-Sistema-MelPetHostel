const express = require("express");
const router = express.Router();
const {
  notifyDocumentUploadForReview,
} = require("../../utils/moduleAccessNotification");
const {
  TABLE_NAMES,
  dbFor,
  ensureUserDocumentStorage,
  fs,
  getCurrentClienteId,
  getReqLogin,
  getUsuarioByLogin,
  isAdminUser,
  movePetDocumentsToExpurgo,
  parseJsonArray,
  path,
  qcol,
  qtable,
  requireCompleteClienteCadastro,
  resolveTableName,
  resolveUploadsDirToDisk,
  resolveUploadsFileToDisk,
  toPublicUploadPath,
  toJsonText,
  toText,
  uploadContrato,
} = require("./context");

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function normalizeText(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseVacinaTiposText(value) {
  return clean(value)
    .split(/\r?\n/)
    .map((line) => {
      const [descricao, ...duracaoParts] = line.split("|");
      return {
        descricao: clean(descricao),
        duracao: clean(duracaoParts.join("|")),
      };
    })
    .filter((item) => item.descricao && item.descricao !== "[object Object]");
}

function serializeVacinaTiposText(tipos = []) {
  return tipos
    .map((item) => `${clean(item.descricao).replace(/\|/g, " ")}|${clean(item.duracao).replace(/\|/g, " ")}`)
    .filter((line) => line.split("|")[0])
    .join("\n");
}

function normalizeFileNamePart(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/\\\\:?"<>|*]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function todayFileDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDateOnly(value) {
  if (!value) return "";
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}


async function getPetByIdForCliente(req, petId, clienteId = null) {
  const petsTable = await resolveTableName(req, TABLE_NAMES.pets);
  if (!petsTable) return null;

  const where = clienteId ? "WHERE id = ? AND cliente_id = ?" : "WHERE id = ?";
  const values = clienteId ? [petId, clienteId] : [petId];
  const [rows] = await dbFor(req).query(
    `SELECT id, cliente_id, nome, raca, data_nascimento, peso_aproximado
       FROM ${qtable(petsTable)}
       ${where}
      LIMIT 1`,
    values,
  );

  return rows && rows.length ? rows[0] : null;
}

async function requireCarteirasTable(req, res) {
  const tableName = await resolveTableName(
    req,
    TABLE_NAMES.petCarteirasVacinacao,
  );
  if (!tableName) {
    res.status(500).json({
      status: "erro",
      mensagem:
        "Tabela Pet_Carteiras_Vacinacao nao encontrada. Execute create_pets_schema.sql atualizado.",
    });
    return null;
  }
  return tableName;
}

async function ensureCarteiraRejectionReasonColumn(req, tableName) {
  const [rows] = await dbFor(req).query(
    `
      SELECT COUNT(*) AS total
        FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = 'motivo_reprovacao'
    `,
    [tableName],
  );
  if (Number(rows?.[0]?.total || 0) > 0) return;

  await dbFor(req).query(
    `ALTER TABLE ${qtable(tableName)} ADD COLUMN motivo_reprovacao TEXT NULL AFTER status`,
  );
}

function mapCarteiraRow(row) {
  return {
    id: row.id,
    petId: row.pet_id,
    clienteId: row.cliente_id,
    lado: row.lado || "frente",
    nomeArquivo: row.nome_arquivo,
    filePath: row.file_path,
    fileUrl: row.file_path ? toPublicUploadPath(row.file_path) : null,
    conferido: String(row.status || "").toLowerCase() === "aprovado" || Boolean(row.conferido),
    conferidoAt: row.conferido_at || null,
    conferidoPor: row.conferido_por || null,
    status: row.status || "pendente",
    motivoReprovacao: row.motivo_reprovacao || "",
    petNome: row.pet_nome || "",
    clienteNome: row.cliente_nome || "",
  };
}

function normalizeCarteiraSide(value) {
  const side = clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return side === "verso" ? "verso" : "frente";
}

async function requireVacinasConfigTable(req, res) {
  const tableName = await resolveTableName(req, TABLE_NAMES.petVacinasConfig);
  if (!tableName) {
    res.status(500).json({
      status: "erro",
      mensagem:
        "Tabela Pet_Vacinas_Config nao encontrada. Execute create_pets_schema.sql atualizado.",
    });
    return null;
  }
  return tableName;
}

function normalizeVacinaConfig(row) {
  return {
    id: row.id,
    descricao: row.descricao || "",
    tipos: getVacinaConfigPayload({ tipos: parseVacinaTiposText(row.tipos) }).tipos,
    obrigatorio:
      row.obrigatorio === undefined || row.obrigatorio === null
        ? false
        : row.obrigatorio == 1,
    ativo: row.ativo === undefined || row.ativo === null ? true : row.ativo == 1,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function getVacinaConfigPayload(body = {}) {
  const descricao = clean(body.descricao);
  const tipos = Array.isArray(body.tipos)
    ? body.tipos
        .map((item) => {
          if (item && typeof item === "object") {
            return {
              descricao: clean(
                item.descricao ||
                  item.tipo ||
                  item.label ||
                  item.nome ||
                  item.valor ||
                  item.value,
              ),
              duracao: clean(item.duracao),
            };
          }
          return { descricao: clean(item), duracao: clean(body.duracao) };
        })
        .filter((item) => item.descricao && item.descricao !== "[object Object]")
    : [];
  const uniqueTipos = Array.from(
    new Map(tipos.map((item) => [normalizeText(item.descricao), item])).values(),
  );

  return {
    descricao,
    tipos: uniqueTipos,
    obrigatorio: Boolean(body.obrigatorio),
    ativo: body.ativo === undefined ? true : Boolean(body.ativo),
  };
}

function validateVacinaConfigPayload(payload) {
  if (!payload.descricao) return "Descrição é obrigatória.";
  if (!payload.tipos.length) return "Informe pelo menos um tipo.";
  return "";
}

router.get("/pets/vacinas-config", async (req, res) => {
  try {
    const tableName = await requireVacinasConfigTable(req, res);
    if (!tableName) return;

    const [rows] = await dbFor(req).query(
      `
        SELECT *
        FROM ${qtable(tableName)}
        WHERE ativo = 1
        ORDER BY descricao ASC, id ASC
      `,
    );

    return res.json({
      status: "sucesso",
      itens: (rows || []).map(normalizeVacinaConfig),
    });
  } catch (error) {
    console.error("Error in GET /melpethostel/pets/vacinas-config:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post("/pets/vacinas-config", async (req, res) => {
  try {
    const tableName = await requireVacinasConfigTable(req, res);
    if (!tableName) return;

    const payload = getVacinaConfigPayload(req.body || {});
    const validationMessage = validateVacinaConfigPayload(payload);
    if (validationMessage) {
      return res.status(400).json({ status: "erro", mensagem: validationMessage });
    }

    const [result] = await dbFor(req).query(
      `
        INSERT INTO ${qtable(tableName)}
          (${[qcol("descricao"), qcol("tipos"), qcol("obrigatorio"), qcol("ativo")].join(", ")})
        VALUES (?, ?, ?, ?)
      `,
      [
        payload.descricao,
        serializeVacinaTiposText(payload.tipos),
        payload.obrigatorio ? 1 : 0,
        payload.ativo ? 1 : 0,
      ],
    );

    return res.status(201).json({
      status: "sucesso",
      mensagem: "Configuração salva com sucesso.",
      item: {
        id: result.insertId,
        descricao: payload.descricao,
        tipos: payload.tipos,
        obrigatorio: payload.obrigatorio,
        ativo: payload.ativo,
      },
    });
  } catch (error) {
    console.error("Error in POST /melpethostel/pets/vacinas-config:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.put("/pets/vacinas-config/:id", async (req, res) => {
  try {
    const tableName = await requireVacinasConfigTable(req, res);
    if (!tableName) return;

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ status: "erro", mensagem: "ID inválido." });
    }

    const payload = getVacinaConfigPayload(req.body || {});
    const validationMessage = validateVacinaConfigPayload(payload);
    if (validationMessage) {
      return res.status(400).json({ status: "erro", mensagem: validationMessage });
    }

    const [result] = await dbFor(req).query(
      `
        UPDATE ${qtable(tableName)}
        SET ${qcol("descricao")} = ?,
            ${qcol("tipos")} = ?,
            ${qcol("obrigatorio")} = ?,
            ${qcol("ativo")} = ?
        WHERE ${qcol("id")} = ?
      `,
      [
        payload.descricao,
        serializeVacinaTiposText(payload.tipos),
        payload.obrigatorio ? 1 : 0,
        payload.ativo ? 1 : 0,
        id,
      ],
    );

    if (!result || result.affectedRows === 0) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Configuração não encontrada." });
    }

    return res.json({
      status: "sucesso",
      mensagem: "Configuração atualizada com sucesso.",
      item: { id, ...payload },
    });
  } catch (error) {
    console.error("Error in PUT /melpethostel/pets/vacinas-config/:id:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.delete("/pets/vacinas-config/:id", async (req, res) => {
  try {
    const tableName = await requireVacinasConfigTable(req, res);
    if (!tableName) return;

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ status: "erro", mensagem: "ID inválido." });
    }

    const [result] = await dbFor(req).query(
      `
        UPDATE ${qtable(tableName)}
        SET ${qcol("ativo")} = 0
        WHERE ${qcol("id")} = ?
      `,
      [id],
    );

    if (!result || result.affectedRows === 0) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Configuração não encontrada." });
    }

    return res.json({
      status: "sucesso",
      mensagem: "Configuração excluída com sucesso.",
    });
  } catch (error) {
    console.error("Error in DELETE /melpethostel/pets/vacinas-config/:id:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.get("/pets", async (req, res) => {
  try {
    const clienteId = await getCurrentClienteId(req);
    if (!clienteId) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Usuário sem cliente vinculado para listar pets.",
      });
    }

    const petsTable = await resolveTableName(req, TABLE_NAMES.pets);
    const fichasTable = await resolveTableName(req, TABLE_NAMES.petFichas);
    if (!petsTable || !fichasTable) {
      return res.json({ status: "ok", pets: [] });
    }

    const [rows] = await dbFor(req).query(
      `
        SELECT
          p.id,
          p.nome,
          p.raca,
          p.data_nascimento,
          p.peso_aproximado,
          p.criado_em,
          f.veterinario_nome,
          f.clinica_nome,
          f.clinica_telefone,
          f.clinica_endereco,
          f.autoriza_atendimento_emergencial,
          f.autoriza_medicacao,
          f.sexo,
          f.castrado,
          f.doenca_diagnosticada,
          f.doenca_detalhes,
          f.cirurgias_historico,
          f.cirurgias_detalhes,
          f.medicamento_continuo,
          f.medicamento_detalhes,
          f.alimentacao_tipos,
          f.alimentacao_marca,
          f.alimentacao_quantidade_horarios,
          f.restricoes_alimentares,
          f.deixa_mexer_potinho,
          f.petiscos,
          f.comportamento_caes,
          f.agressividade,
          f.agressividade_situacoes,
          f.destroi_objetos,
          f.ansiedade_separacao,
          f.medos_especificos,
          f.reacao_medo,
          f.como_acalmar,
          f.fica_sozinho,
          f.tempo_sozinho,
          f.local_dormir,
          f.ritual_dormir_comer,
          f.aceita_banho_escovacao,
          f.aceita_roupinha,
          f.permite_manuseio,
          f.gosta_colo,
          f.sensibilidade_fisica,
          f.sensibilidade_detalhes,
          f.brinca_piscina,
          f.brinca_mangueira,
          f.brinca_bolinha,
          f.brinca_madeira,
          f.observacoes_tutor,
          f.data_nascimento AS ficha_data_nascimento,
          f.veracidade_informacoes
        FROM ${qtable(petsTable)} p
        LEFT JOIN ${qtable(fichasTable)} f ON f.pet_id = p.id
        WHERE p.cliente_id = ? AND p.ativo = 1
        ORDER BY p.criado_em DESC, p.id DESC
      `,
      [clienteId],
    );

    const carteirasByPetId = new Map();
    const carteirasTable = await resolveTableName(
      req,
      TABLE_NAMES.petCarteirasVacinacao,
    );
    if (carteirasTable) {
      const [carteiraRows] = await dbFor(req).query(
        `
          SELECT *
          FROM ${qtable(carteirasTable)}
          WHERE cliente_id = ?
            AND (status IS NULL OR status <> 'expurgado')
          ORDER BY created_at DESC, id DESC
        `,
        [clienteId],
      );

      for (const row of carteiraRows || []) {
        const petId = Number(row.pet_id);
        const current = carteirasByPetId.get(petId) || [];
        current.push(mapCarteiraRow(row));
        carteirasByPetId.set(petId, current);
      }
    }

    return res.json({
      status: "ok",
      pets: (rows || []).map((pet) => ({
        id: pet.id,
        nome: pet.nome,
        raca: pet.raca,
        dataNascimento: normalizeDateOnly(pet.data_nascimento),
        pesoAproximado: pet.peso_aproximado,
        cadastradoEm: pet.criado_em,
        carteiras: carteirasByPetId.get(Number(pet.id)) || [],
        ficha: {
          nomePet: pet.nome,
          raca: pet.raca,
          dataNascimento: normalizeDateOnly(pet.data_nascimento),
        pesoAproximado: pet.peso_aproximado,
          veterinarioNome: pet.veterinario_nome,
          clinicaNome: pet.clinica_nome,
          clinicaTelefone: pet.clinica_telefone,
          clinicaEndereco: pet.clinica_endereco,
          autorizaAtendimentoEmergencial: pet.autoriza_atendimento_emergencial,
          autorizaMedicacao: pet.autoriza_medicacao,
          sexo: pet.sexo,
          castrado: pet.castrado,
          doencaDiagnosticada: pet.doenca_diagnosticada,
          doencaDetalhes: pet.doenca_detalhes,
          cirurgiasHistorico: pet.cirurgias_historico,
          cirurgiasDetalhes: pet.cirurgias_detalhes,
          medicamentoContinuo: pet.medicamento_continuo,
          medicamentoDetalhes: pet.medicamento_detalhes,
          alimentacaoTipos: parseJsonArray(pet.alimentacao_tipos),
          alimentacaoMarca: pet.alimentacao_marca,
          alimentacaoQuantidadeHorarios: pet.alimentacao_quantidade_horarios,
          restricoesAlimentares: pet.restricoes_alimentares,
          deixaMexerPotinho: pet.deixa_mexer_potinho,
          petiscos: pet.petiscos,
          comportamentoCaes: pet.comportamento_caes,
          agressividade: pet.agressividade,
          agressividadeSituacoes: pet.agressividade_situacoes,
          destroiObjetos: pet.destroi_objetos,
          ansiedadeSeparacao: pet.ansiedade_separacao,
          medosEspecificos: pet.medos_especificos,
          reacaoMedo: pet.reacao_medo,
          comoAcalmar: pet.como_acalmar,
          ficaSozinho: pet.fica_sozinho,
          tempoSozinho: pet.tempo_sozinho,
          localDormir: pet.local_dormir,
          ritualDormirComer: pet.ritual_dormir_comer,
          aceitaBanhoEscovacao: pet.aceita_banho_escovacao,
          aceitaRoupinha: pet.aceita_roupinha,
          permiteManuseio: pet.permite_manuseio,
          gostaColo: pet.gosta_colo,
          sensibilidadeFisica: pet.sensibilidade_fisica,
          sensibilidadeDetalhes: pet.sensibilidade_detalhes,
          brincaPiscina: pet.brinca_piscina,
          brincaMangueira: pet.brinca_mangueira,
          brincaBolinha: pet.brinca_bolinha,
          brincaMadeira: pet.brinca_madeira,
          observacoesTutor: pet.observacoes_tutor,
          veracidadeInformacoes: Boolean(pet.veracidade_informacoes),
        },
      })),
    });
  } catch (error) {
    console.error("Error in GET /melpethostel/pets:", error);
    return res.status(500).json({
      status: "erro",
      mensagem: error?.message || "Não foi possível listar os pets.",
    });
  }
});

router.get("/pets/carteiras-vacinacao/pendentes", async (req, res) => {
  try {
    const tableName = await requireCarteirasTable(req, res);
    if (!tableName) return;

    const petsTable = await resolveTableName(req, TABLE_NAMES.pets);
    const clientesTable = await resolveTableName(req, TABLE_NAMES.clientes);
    if (!petsTable || !clientesTable) {
      return res.json({ status: "sucesso", carteiras: [] });
    }

    const [rows] = await dbFor(req).query(
      `
        SELECT cv.*,
               p.nome AS pet_nome,
               c.nome AS cliente_nome
        FROM ${qtable(tableName)} cv
        INNER JOIN ${qtable(petsTable)} p ON p.id = cv.pet_id
        INNER JOIN ${qtable(clientesTable)} c ON c.id = cv.cliente_id
        WHERE (cv.status IS NULL OR cv.status = 'pendente')
          AND p.ativo = 1
        ORDER BY cv.created_at ASC, cv.id ASC
      `,
    );

    const carteiras = (rows || []).map(mapCarteiraRow);
    const petIds = Array.from(
      new Set(carteiras.map((item) => Number(item.petId)).filter(Boolean)),
    );

    if (petIds.length) {
      const respostasTable = await resolveTableName(
        req,
        TABLE_NAMES.petVacinasRespostas,
      );
      const configs = await getVaccineConfigs(req);
      const configById = new Map(
        configs.map((config) => [Number(config.id), config]),
      );

      if (respostasTable) {
        const placeholders = petIds.map(() => "?").join(", ");
        const [responseRows] = await dbFor(req).query(
          `
            SELECT pet_id, config_id, valor, data_aplicacao
            FROM ${qtable(respostasTable)}
            WHERE pet_id IN (${placeholders})
            ORDER BY pet_id ASC, config_id ASC
          `,
          petIds,
        );
        const responsesByPetId = new Map();
        for (const row of responseRows || []) {
          const petId = Number(row.pet_id);
          const config = configById.get(Number(row.config_id)) || {};
          const tipo = (Array.isArray(config.tipos) ? config.tipos : []).find(
            (item) => normalizeText(item.descricao) === normalizeText(row.valor),
          );
          const current = responsesByPetId.get(petId) || [];
          current.push({
            configId: row.config_id,
            descricao: config.descricao || "",
            tipo: row.valor || "",
            duracao: tipo?.duracao || "",
            dataAplicacao: row.data_aplicacao || "",
          });
          responsesByPetId.set(petId, current);
        }

        for (const carteira of carteiras) {
          carteira.vacinas = responsesByPetId.get(Number(carteira.petId)) || [];
        }
      }
    }

    return res.json({ status: "sucesso", carteiras });
  } catch (error) {
    console.error(
      "Error in GET /melpethostel/pets/carteiras-vacinacao/pendentes:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

async function getVaccineConfigs(req) {
  const tableName = await resolveTableName(req, TABLE_NAMES.petVacinasConfig);
  if (!tableName) return [];
  const [rows] = await dbFor(req).query(
    `SELECT * FROM ${qtable(tableName)} WHERE ativo = 1 ORDER BY descricao ASC, id ASC`,
  );
  return (rows || []).map(normalizeVacinaConfig);
}

async function getPetOnboardingData(req, pet) {
  const carteirasTable = await resolveTableName(
    req,
    TABLE_NAMES.petCarteirasVacinacao,
  );
  const respostasTable = await resolveTableName(
    req,
    TABLE_NAMES.petVacinasRespostas,
  );
  const configs = await getVaccineConfigs(req);
  const carteiras = [];
  const respostas = [];

  if (carteirasTable) {
    const [rows] = await dbFor(req).query(
      `SELECT *
         FROM ${qtable(carteirasTable)}
        WHERE pet_id = ?
          AND (status IS NULL OR status <> 'expurgado')
          AND (status IS NULL OR status <> 'reprovado')
        ORDER BY id ASC`,
      [pet.id],
    );
    for (const row of rows || []) {
      carteiras.push(mapCarteiraRow(row));
    }
  }

  if (respostasTable) {
    const [rows] = await dbFor(req).query(
      `SELECT * FROM ${qtable(respostasTable)} WHERE pet_id = ?`,
      [pet.id],
    );
    respostas.push(...(rows || []));
  }

  const hasFrente = carteiras.some((item) => item.lado === "frente");
  const hasVerso = carteiras.some((item) => item.lado === "verso");
  const responseByConfig = new Map(
    respostas.map((item) => [
      Number(item.config_id),
      {
        configId: item.config_id,
        valor: item.valor,
        dataAplicacao: item.data_aplicacao,
      },
    ]),
  );
  const requiredConfigs = configs.filter(
    (item) =>
      item.obrigatorio ||
      String(item.descricao || "").toLowerCase().includes("escudo protetor"),
  );
  const requiredAnswered = requiredConfigs.every((item) => {
    const resposta = responseByConfig.get(Number(item.id));
    return Boolean(resposta?.valor && resposta?.dataAplicacao);
  });

  return {
    complete: hasFrente && hasVerso && requiredAnswered,
    carteiras,
    configs,
    respostas: Array.from(responseByConfig.values()),
  };
}

router.get("/pets/onboarding-status", async (req, res) => {
  try {
    const clienteId = await getCurrentClienteId(req);
    if (!clienteId) {
      return res.json({ status: "sucesso", complete: false, pendingPet: null });
    }

    const petsTable = await resolveTableName(req, TABLE_NAMES.pets);
    const fichasTable = await resolveTableName(req, TABLE_NAMES.petFichas);
    if (!petsTable) {
      return res.json({ status: "sucesso", complete: true, pendingPet: null });
    }

    const [pets] = await dbFor(req).query(
      fichasTable
        ? `
          SELECT
            p.id,
            p.cliente_id,
            p.nome,
            p.raca,
            p.data_nascimento,
            p.peso_aproximado,
            f.sexo
          FROM ${qtable(petsTable)} p
          LEFT JOIN ${qtable(fichasTable)} f
            ON f.pet_id = p.id
          WHERE p.cliente_id = ? AND p.ativo = 1
          ORDER BY p.criado_em ASC, p.id ASC
        `
        : `
          SELECT id, cliente_id, nome, raca, data_nascimento, peso_aproximado, '' AS sexo
          FROM ${qtable(petsTable)}
          WHERE cliente_id = ? AND ativo = 1
          ORDER BY criado_em ASC, id ASC
        `,
      [clienteId],
    );

    if (!Array.isArray(pets) || pets.length === 0) {
      return res.json({ status: "sucesso", complete: false, pendingPet: null });
    }

    for (const pet of pets || []) {
      const data = await getPetOnboardingData(req, pet);
      if (!data.complete) {
        return res.json({
          status: "sucesso",
          complete: false,
          pendingPet: {
            id: pet.id,
            clienteId: pet.cliente_id,
            nome: pet.nome,
            raca: pet.raca,
            dataNascimento: normalizeDateOnly(pet.data_nascimento),
        pesoAproximado: pet.peso_aproximado,
            sexo: pet.sexo || "",
            ficha: {
              sexo: pet.sexo || "",
            },
          },
          ...data,
        });
      }
    }

    return res.json({ status: "sucesso", complete: true, pendingPet: null });
  } catch (error) {
    console.error("Error in GET /melpethostel/pets/onboarding-status:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});


router.get("/pets/carteiras-vacinacao/:id/preview", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ status: "erro", mensagem: "Carteirinha invalida." });
    }

    const login = getReqLogin(req);
    const tableName = await requireCarteirasTable(req, res);
    if (!tableName) return;

    const [rows] = await dbFor(req).query(
      `SELECT id, cliente_id, file_path, nome_arquivo
         FROM ${qtable(tableName)}
        WHERE id = ?
          AND (status IS NULL OR status <> 'expurgado')
        LIMIT 1`,
      [id],
    );
    const carteira = rows && rows[0];
    if (!carteira?.file_path) {
      return res.status(404).json({ status: "erro", mensagem: "Carteirinha nao encontrada." });
    }

    const admin = await isAdminUser(req, login);
    if (!admin) {
      const clienteId = await getCurrentClienteId(req);
      if (!clienteId || Number(clienteId) !== Number(carteira.cliente_id)) {
        return res.status(403).json({ status: "erro", mensagem: "Sem permissao para visualizar esta carteirinha." });
      }
    }

    const diskPath = resolveUploadsFileToDisk(carteira.file_path);
    const buffer = await fs.readFile(diskPath);
    return res.json({
      status: "sucesso",
      contentType: "application/pdf",
      fileName: carteira.nome_arquivo || "carteirinha.pdf",
      base64: buffer.toString("base64"),
    });
  } catch (error) {
    console.error("Error in GET /melpethostel/pets/carteiras-vacinacao/:id/preview:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.get("/pets/:petId/carteira-vacinacao/info", async (req, res) => {
  try {
    const login = getReqLogin(req);
    const adminClienteId = Number(req.query?.clienteId);
    const clienteId =
      adminClienteId > 0 && (await isAdminUser(req, login))
        ? adminClienteId
        : await getCurrentClienteId(req);
    const petId = Number(req.params.petId);
    if (!clienteId || !Number.isInteger(petId) || petId <= 0) {
      return res.status(400).json({ status: "erro", mensagem: "Pet inválido." });
    }

    const pet = await getPetByIdForCliente(req, petId, clienteId);
    if (!pet) {
      return res.status(404).json({ status: "erro", mensagem: "Pet não encontrado." });
    }

    const respostasTable = await resolveTableName(
      req,
      TABLE_NAMES.petVacinasRespostas,
    );
    const carteirasTable = await resolveTableName(
      req,
      TABLE_NAMES.petCarteirasVacinacao,
    );
    const carteiras = [];
    if (carteirasTable) {
      const [carteiraRows] = await dbFor(req).query(
        `SELECT *
           FROM ${qtable(carteirasTable)}
          WHERE pet_id = ?
            AND (status IS NULL OR status <> 'expurgado')
            AND (status IS NULL OR status <> 'reprovado')
          ORDER BY id ASC`,
        [petId],
      );
      for (const row of carteiraRows || []) {
        carteiras.push(mapCarteiraRow(row));
      }
    }

    if (!respostasTable) {
      return res.json({
        status: "sucesso",
        pet: { id: pet.id, nome: pet.nome },
        itens: [],
        carteiras,
      });
    }

    const configs = await getVaccineConfigs(req);
    const configById = new Map(configs.map((config) => [Number(config.id), config]));
    const [rows] = await dbFor(req).query(
      `
        SELECT config_id, valor, data_aplicacao
        FROM ${qtable(respostasTable)}
        WHERE pet_id = ? AND cliente_id = ?
        ORDER BY data_aplicacao DESC, config_id ASC
      `,
      [petId, clienteId],
    );

    const itens = (rows || []).map((row) => {
      const config = configById.get(Number(row.config_id)) || {};
      const tipo = (Array.isArray(config.tipos) ? config.tipos : []).find(
        (item) => normalizeText(item.descricao) === normalizeText(row.valor),
      );
      return {
        configId: row.config_id,
        descricao: config.descricao || "",
        tipo: row.valor || "",
        duracao: tipo?.duracao || "",
        dataAplicacao: row.data_aplicacao || "",
      };
    });

    return res.json({
      status: "sucesso",
      pet: { id: pet.id, nome: pet.nome },
      itens,
      carteiras,
    });
  } catch (error) {
    console.error(
      "Error in GET /melpethostel/pets/:petId/carteira-vacinacao/info:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post("/pets/:petId/vacinas-respostas", async (req, res) => {
  try {
    const login = getReqLogin(req);
    const adminClienteId = Number(req.body?.clienteId);
    const clienteId =
      adminClienteId > 0 && (await isAdminUser(req, login))
        ? adminClienteId
        : await getCurrentClienteId(req);
    const petId = Number(req.params.petId);
    if (!clienteId || !Number.isInteger(petId) || petId <= 0) {
      return res.status(400).json({ status: "erro", mensagem: "Pet inválido." });
    }

    const pet = await getPetByIdForCliente(req, petId, clienteId);
    if (!pet) {
      return res.status(404).json({ status: "erro", mensagem: "Pet não encontrado." });
    }

    const tableName = await resolveTableName(req, TABLE_NAMES.petVacinasRespostas);
    if (!tableName) {
      return res.status(500).json({
        status: "erro",
        mensagem:
          "Tabela Pet_Vacinas_Respostas nao encontrada. Execute create_pets_schema.sql atualizado.",
      });
    }

    const respostas = Array.isArray(req.body?.respostas) ? req.body.respostas : [];
    for (const resposta of respostas) {
      const configId = Number(resposta.configId);
      const valor = clean(resposta.valor);
      const dataAplicacao = clean(resposta.dataAplicacao);
      if (!Number.isInteger(configId) || configId <= 0 || !valor || !dataAplicacao) {
        continue;
      }
      await dbFor(req).query(
        `
          INSERT INTO ${qtable(tableName)}
            (pet_id, cliente_id, config_id, valor, data_aplicacao)
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            valor = VALUES(valor),
            data_aplicacao = VALUES(data_aplicacao)
        `,
        [petId, clienteId, configId, valor, dataAplicacao],
      );
    }

    return res.json({ status: "sucesso", mensagem: "Vacinas salvas com sucesso." });
  } catch (error) {
    console.error("Error in POST /melpethostel/pets/:petId/vacinas-respostas:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post("/pets/carteiras-vacinacao/:id/aprovar", async (req, res) => {
  try {
    const tableName = await requireCarteirasTable(req, res);
    if (!tableName) return;

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "ID da carteira invalido." });
    }

    const login = getReqLogin(req) || "administrador";
    await ensureCarteiraRejectionReasonColumn(req, tableName);
    const [result] = await dbFor(req).query(
      `
        UPDATE ${qtable(tableName)}
           SET conferido_at = NOW(),
               conferido_por = ?,
               status = 'aprovado',
               motivo_reprovacao = NULL
         WHERE id = ?
      `,
      [login, id],
    );

    if (!result || result.affectedRows === 0) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Carteira nao encontrada." });
    }

    return res.json({
      status: "sucesso",
      mensagem: "Carteira de vacinação aprovada com sucesso.",
    });
  } catch (error) {
    console.error(
      "Error in POST /melpethostel/pets/carteiras-vacinacao/:id/aprovar:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post(
  "/pets/:petId/carteira-vacinacao/upload",
  uploadContrato.single("arquivo"),
  async (req, res) => {
    try {
      const login = getReqLogin(req);
      if (!login) {
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Usuário não identificado." });
      }

      if (!(await requireCompleteClienteCadastro(req, res, login))) return;

      if (!req.file || !req.file.buffer) {
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Arquivo é obrigatório." });
      }

      const originalName = String(req.file.originalname || "").toLowerCase();
      const mime = String(req.file.mimetype || "").toLowerCase();
      if (!originalName.endsWith(".pdf") && mime !== "application/pdf") {
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Envie um arquivo PDF." });
      }

      const clienteId = await getCurrentClienteId(req);
      const petId = Number(req.params.petId);
      if (!clienteId || !Number.isInteger(petId) || petId <= 0) {
        return res.status(400).json({
          status: "erro",
          mensagem: "Pet ou cliente invalido para upload da carteira.",
        });
      }

      const pet = await getPetByIdForCliente(req, petId, clienteId);
      if (!pet) {
        return res
          .status(404)
          .json({ status: "erro", mensagem: "Pet nao encontrado." });
      }

      const tableName = await requireCarteirasTable(req, res);
      if (!tableName) return;

      const userDirData = await ensureUserDocumentStorage(req, login);
      if (!userDirData) {
        return res.status(400).json({
          status: "erro",
          mensagem: "Usuário sem grupo configurado para salvar documento.",
        });
      }

      const relativeDir = userDirData.relativeDir;
      const diskDir = resolveUploadsDirToDisk(relativeDir);

      const baseName = normalizeFileNamePart(
        `Carteira de Vacinacao ${normalizeCarteiraSide(req.body?.lado)} - ${pet.nome} ${todayFileDate()}`,
      );
      const nomeArquivo = `${baseName || `Carteira de Vacinacao - Pet ${petId}`}.pdf`;
      const fullPath = path.join(diskDir, nomeArquivo);
      await fs.writeFile(fullPath, req.file.buffer);

      const filePath = `${relativeDir}/${nomeArquivo}`.replace(/\\/g, "/");
      const lado = normalizeCarteiraSide(req.body?.lado);
      const [result] = await dbFor(req).query(
        `
          INSERT INTO ${qtable(tableName)}
            (${[
              "pet_id",
              "cliente_id",
              "lado",
              "nome_arquivo",
              "file_path",
              "status",
            ]
              .map(qcol)
              .join(", ")})
          VALUES (?, ?, ?, ?, ?, 'pendente')
        `,
        [petId, clienteId, lado, nomeArquivo, filePath],
      );

      getUsuarioByLogin(req, login)
        .catch((error) => {
          console.error(
            "Erro ao carregar usuário para notificação de carteira:",
            error?.message || error,
          );
          return null;
        })
        .then((usuario) =>
          notifyDocumentUploadForReview(req, {
            usuario,
            login,
            documentNames: [
              `Carteirinha de Vacinação ${lado === "verso" ? "Verso" : "Frente"} - ${pet.nome}`,
            ],
          }),
        )
        .catch((error) => {
          console.error(
            "Erro ao enviar aviso de carteira no Telegram:",
            error?.message || error,
          );
        });

      return res.status(201).json({
        status: "sucesso",
        mensagem: "Carteira de vacinação enviada com sucesso.",
        carteira: {
          id: result.insertId,
          petId,
          clienteId,
          lado,
          nomeArquivo,
          filePath,
        },
      });
    } catch (error) {
      console.error(
        "Error in POST /melpethostel/pets/:petId/carteira-vacinacao/upload:",
        error,
      );
      return res.status(500).json({ status: "erro", mensagem: error.message });
    }
  },
);

router.delete("/pets/:petId", async (req, res) => {
  try {
    const login = getReqLogin(req);
    const clienteId = await getCurrentClienteId(req);
    const petId = Number(req.params.petId);
    if (!login || !clienteId || !Number.isInteger(petId) || petId <= 0) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Pet ou cliente invalido para exclusao.",
      });
    }

    const pet = await getPetByIdForCliente(req, petId, clienteId);
    if (!pet) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Pet nao encontrado." });
    }

    const petsTable = await resolveTableName(req, TABLE_NAMES.pets);
    if (!petsTable) {
      return res.status(500).json({
        status: "erro",
        mensagem: "Tabela Pets nao encontrada.",
      });
    }

    const userDirData = await ensureUserDocumentStorage(req, login);
    if (!userDirData) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Usuario sem grupo configurado para mover documentos.",
      });
    }

    await dbFor(req).beginTransaction();
    try {
      await dbFor(req).query(
        `UPDATE ${qtable(petsTable)} SET ativo = 0 WHERE id = ? AND cliente_id = ?`,
        [petId, clienteId],
      );

      const movedDocuments = await movePetDocumentsToExpurgo(req, {
        petId,
        clienteId,
        login,
      });

      await dbFor(req).commit();

      return res.json({
        status: "sucesso",
        mensagem: "Pet excluido com sucesso.",
        pet: { id: petId, ativo: false },
        documentosMovidos: movedDocuments,
      });
    } catch (error) {
      await dbFor(req).rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error in DELETE /melpethostel/pets/:petId:", error);
    return res.status(500).json({
      status: "erro",
      mensagem: error?.message || "Nao foi possivel excluir o pet.",
    });
  }
});

router.post("/pets/carteiras-vacinacao/:id/reprovar", async (req, res) => {
  try {
    const tableName = await requireCarteirasTable(req, res);
    if (!tableName) return;

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "ID da carteira invalido." });
    }
    const motivoReprovacao = clean(req.body?.motivoReprovacao);
    if (!motivoReprovacao) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Informe o motivo da reprovação.",
      });
    }

    const login = getReqLogin(req) || "administrador";
    await ensureCarteiraRejectionReasonColumn(req, tableName);
    const [result] = await dbFor(req).query(
      `
        UPDATE ${qtable(tableName)}
           SET conferido_at = NOW(),
               conferido_por = ?,
               status = 'reprovado',
               motivo_reprovacao = ?
         WHERE id = ?
      `,
      [login, motivoReprovacao, id],
    );

    if (!result || result.affectedRows === 0) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Carteira nao encontrada." });
    }

    return res.json({
      status: "sucesso",
      mensagem: "Carteira de vacinação reprovada com sucesso.",
    });
  } catch (error) {
    console.error(
      "Error in POST /melpethostel/pets/carteiras-vacinacao/:id/reprovar:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post("/pets", async (req, res) => {
  let insertedPetId = null;
  let insertedPetsTable = null;

  try {
    const dbConn = dbFor(req);
    const clienteId = await getCurrentClienteId(req);
    if (clienteId) {
      const clientesTable = await resolveTableName(req, TABLE_NAMES.clientes);
      if (!clientesTable) {
        return res.status(400).json({
          status: "erro",
          mensagem:
            "Tabela Clientes nao encontrada. Atualize o cadastro antes de cadastrar o pet.",
        });
      }

      const [clienteRows] = await dbConn.query(
        `SELECT id FROM ${qtable(clientesTable)} WHERE id = ? LIMIT 1`,
        [clienteId],
      );
      if (!clienteRows || !clienteRows.length) {
        return res.status(400).json({
          status: "erro",
          mensagem:
            "Cliente vinculado ao usuario nao foi encontrado. Atualize o cadastro antes de cadastrar o pet.",
        });
      }
    }

    if (!clienteId) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Usuário sem cliente vinculado para cadastrar pet.",
      });
    }

    const petsTable = await resolveTableName(req, TABLE_NAMES.pets);
    insertedPetsTable = petsTable;
    const fichasTable = await resolveTableName(req, TABLE_NAMES.petFichas);
    if (!petsTable || !fichasTable) {
      return res.status(400).json({
        status: "erro",
        mensagem:
          "Tabelas Pets e Pet_Fichas não encontradas. Execute create_pets_schema.sql.",
      });
    }

    const data = req.body || {};

    const [petResult] = await dbConn.query(
      `
        INSERT INTO ${qtable(petsTable)}
          (cliente_id, nome, raca, data_nascimento, peso_aproximado)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        clienteId,
        toText(data.nomePet),
        toText(data.raca),
        normalizeDateOnly(data.dataNascimento),
        toText(data.pesoAproximado),
      ],
    );

    const petId = petResult.insertId;
    insertedPetId = petId;

    await dbConn.query(
      `
        INSERT INTO ${qtable(fichasTable)} (
          pet_id,
          data_nascimento,
          veterinario_nome,
          clinica_nome,
          clinica_telefone,
          clinica_endereco,
          autoriza_atendimento_emergencial,
          autoriza_medicacao,
          sexo,
          castrado,
          doenca_diagnosticada,
          doenca_detalhes,
          cirurgias_historico,
          cirurgias_detalhes,
          medicamento_continuo,
          medicamento_detalhes,
          alimentacao_tipos,
          alimentacao_marca,
          alimentacao_quantidade_horarios,
          restricoes_alimentares,
          deixa_mexer_potinho,
          petiscos,
          comportamento_caes,
          agressividade,
          agressividade_situacoes,
          destroi_objetos,
          ansiedade_separacao,
          medos_especificos,
          reacao_medo,
          como_acalmar,
          fica_sozinho,
          tempo_sozinho,
          local_dormir,
          ritual_dormir_comer,
          aceita_banho_escovacao,
          aceita_roupinha,
          permite_manuseio,
          gosta_colo,
          sensibilidade_fisica,
          sensibilidade_detalhes,
          brinca_piscina,
          brinca_mangueira,
          brinca_bolinha,
          brinca_madeira,
          observacoes_tutor,
          veracidade_informacoes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        petId,
        normalizeDateOnly(data.dataNascimento),
        toText(data.veterinarioNome),
        toText(data.clinicaNome),
        toText(data.clinicaTelefone),
        toText(data.clinicaEndereco),
        toText(data.autorizaAtendimentoEmergencial),
        toText(data.autorizaMedicacao),
        toText(data.sexo),
        toText(data.castrado),
        toText(data.doencaDiagnosticada),
        toText(data.doencaDetalhes),
        toText(data.cirurgiasHistorico),
        toText(data.cirurgiasDetalhes),
        toText(data.medicamentoContinuo),
        toText(data.medicamentoDetalhes),
        toJsonText(data.alimentacaoTipos),
        toText(data.alimentacaoMarca),
        toText(data.alimentacaoQuantidadeHorarios),
        toText(data.restricoesAlimentares),
        toText(data.deixaMexerPotinho),
        toText(data.petiscos),
        toText(data.comportamentoCaes),
        toText(data.agressividade),
        toText(data.agressividadeSituacoes),
        toText(data.destroiObjetos),
        toText(data.ansiedadeSeparacao),
        toText(data.medosEspecificos),
        toText(data.reacaoMedo),
        toText(data.comoAcalmar),
        toText(data.ficaSozinho),
        toText(data.tempoSozinho),
        toText(data.localDormir),
        toText(data.ritualDormirComer),
        toText(data.aceitaBanhoEscovacao),
        toText(data.aceitaRoupinha),
        toText(data.permiteManuseio),
        toText(data.gostaColo),
        toText(data.sensibilidadeFisica),
        toText(data.sensibilidadeDetalhes),
        toText(data.brincaPiscina),
        toText(data.brincaMangueira),
        toText(data.brincaBolinha),
        toText(data.brincaMadeira),
        toText(data.observacoesTutor),
        data.veracidadeInformacoes ? 1 : 0,
      ],
    );

    return res.status(201).json({
      status: "ok",
      pet: {
        id: petId,
        nome: toText(data.nomePet),
        raca: toText(data.raca),
        dataNascimento: normalizeDateOnly(data.dataNascimento),
        pesoAproximado: toText(data.pesoAproximado),
        sexo: toText(data.sexo),
        cadastradoEm: new Date().toISOString(),
        ficha: { ...data, dataNascimento: normalizeDateOnly(data.dataNascimento) },
      },
    });
  } catch (error) {
    if (insertedPetId && insertedPetsTable) {
      try {
        await dbFor(req).query(`DELETE FROM ${qtable(insertedPetsTable)} WHERE id = ?`, [
          insertedPetId,
        ]);
      } catch (cleanupError) {
        console.error("Error cleaning incomplete pet record:", cleanupError);
      }
    }

    console.error("Error in POST /melpethostel/pets:", error);
    if (error?.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        status: "erro",
        mensagem:
          "Nao foi possivel vincular o pet ao cliente. Verifique se o cadastro do cliente esta salvo corretamente.",
      });
    }

    if (error?.code === "ER_BAD_FIELD_ERROR") {
      return res.status(400).json({
        status: "erro",
        mensagem:
          "A estrutura das tabelas Pets/Pet_Fichas esta diferente do esperado. Execute create_pets_schema.sql atualizado.",
      });
    }

    return res.status(500).json({
      status: "erro",
      mensagem: error?.message || "Não foi possível cadastrar o pet.",
    });
  }
});

module.exports = router;



