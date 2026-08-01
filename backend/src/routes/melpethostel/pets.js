const express = require("express");
const router = express.Router();
const {
  TABLE_NAMES,
  dbFor,
  getCurrentClienteId,
  parseJsonArray,
  qtable,
  resolveTableName,
  toJsonText,
  toText,
} = require("./context");

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
          p.idade,
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
          f.veracidade_informacoes
        FROM ${qtable(petsTable)} p
        LEFT JOIN ${qtable(fichasTable)} f ON f.pet_id = p.id
        WHERE p.cliente_id = ? AND p.ativo = 1
        ORDER BY p.criado_em DESC, p.id DESC
      `,
      [clienteId],
    );

    return res.json({
      status: "ok",
      pets: (rows || []).map((pet) => ({
        id: pet.id,
        nome: pet.nome,
        raca: pet.raca,
        idade: pet.idade,
        pesoAproximado: pet.peso_aproximado,
        cadastradoEm: pet.criado_em,
        ficha: {
          nomePet: pet.nome,
          raca: pet.raca,
          idade: pet.idade,
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
          (cliente_id, nome, raca, idade, peso_aproximado)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        clienteId,
        toText(data.nomePet),
        toText(data.raca),
        toText(data.idade),
        toText(data.pesoAproximado),
      ],
    );

    const petId = petResult.insertId;
    insertedPetId = petId;

    await dbConn.query(
      `
        INSERT INTO ${qtable(fichasTable)} (
          pet_id,
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        petId,
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
        idade: toText(data.idade),
        pesoAproximado: toText(data.pesoAproximado),
        cadastradoEm: new Date().toISOString(),
        ficha: data,
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
