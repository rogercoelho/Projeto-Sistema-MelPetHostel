const express = require("express");
const router = express.Router();
const {
  getModuleAccessNotificationConfig,
  getTelegramChatIdByLogin,
  normalizeModule,
  sendTelegram,
} = require("../../services/telegramService");
const {
  TABLE_NAMES,
  dbFor,
  getCurrentClienteId,
  getReqLogin,
  qcol,
  qtable,
  resolveTableName,
} = require("./context");

const MODULE = normalizeModule("melpethostel");

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function asMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function asDate(value) {
  const text = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function formatTelegramDate(value) {
  const [year, month, day] = clean(value).split("-");
  if (!year || !month || !day) return clean(value);
  return `${day}${month}${year.slice(-2)}`;
}

async function notifyAdmins(req, pedido) {
  const db = dbFor(req);
  const config = await getModuleAccessNotificationConfig(MODULE, db);
  if (!config.enabled || !config.adminLogins?.length) {
    return { notified: false, reason: "notificacao_desativada" };
  }

  const message = [
    "<b>Nova solicitação de hospedagem</b>",
    `Tutor: <b>${pedido.login}</b>`,
    `Tipo: <b>${pedido.tipo}</b>`,
    `Entrada: <b>${formatTelegramDate(pedido.dataEntrada)}</b>`,
    `Saída: <b>${formatTelegramDate(pedido.dataSaida)}</b>`,
    `Pets: <b>${pedido.petNames.join(", ")}</b>`,
    `Total: <b>${pedido.totalFormatado}</b>`,
  ].join("\n");

  const notifiedTo = [];
  for (const adminLogin of config.adminLogins) {
    const chatId =
      config.adminChatIds?.[adminLogin] ||
      (await getTelegramChatIdByLogin(MODULE, adminLogin, db));
    if (!chatId) continue;

    try {
      await sendTelegram(chatId, message, { module: MODULE, db });
      notifiedTo.push(adminLogin);
    } catch (error) {
      console.error(
        "notify hospedagem error sending to",
        adminLogin,
        error?.message || error,
      );
    }
  }

  return { notified: Boolean(notifiedTo.length), notifiedTo };
}

router.post("/hospedagens/solicitacoes", async (req, res) => {
  const conn = dbFor(req);

  try {
    const clienteId = await getCurrentClienteId(req);
    const login = getReqLogin(req);
    const tipo = clean(req.body?.tipo);
    const dataEntrada = asDate(req.body?.dataEntrada);
    const dataSaida = asDate(req.body?.dataSaida);
    const dias = Number(req.body?.dias);
    const total = asMoney(req.body?.total);
    const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];

    if (!clienteId) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Cliente não identificado para solicitar hospedagem.",
      });
    }

    if (!tipo || !dataEntrada || !dataSaida || !Number.isInteger(dias) || dias <= 0) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Informe tipo de hospedagem, entrada e saída válidos.",
      });
    }

    if (!itens.length || total === null) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Selecione pelo menos um pet aprovado para a solicitação.",
      });
    }

    const solicitacoesTable = await resolveTableName(
      req,
      TABLE_NAMES.hospedagemSolicitacoes,
    );
    const itensTable = await resolveTableName(
      req,
      TABLE_NAMES.hospedagemSolicitacaoItens,
    );
    if (!solicitacoesTable || !itensTable) {
      return res.status(500).json({
        status: "erro",
        mensagem:
          "Tabelas de hospedagem não encontradas. Execute create_hospedagens_schema.sql.",
      });
    }

    await conn.beginTransaction();

    const [pedidoResult] = await conn.query(
      `
        INSERT INTO ${qtable(solicitacoesTable)}
          (${[
            qcol("cliente_id"),
            qcol("tipo"),
            qcol("data_entrada"),
            qcol("data_saida"),
            qcol("dias"),
            qcol("valor_total"),
            qcol("status"),
          ].join(", ")})
        VALUES (?, ?, ?, ?, ?, ?, 'pendente')
      `,
      [clienteId, tipo, dataEntrada, dataSaida, dias, total],
    );

    const pedidoId = pedidoResult.insertId;
    const petNames = [];
    for (const item of itens) {
      const petId = Number(item.petId);
      const petNome = clean(item.petNome);
      const itemTipo = clean(item.tipo);
      const planoId = item.planoId ? Number(item.planoId) : null;
      const itemDataEntrada = asDate(item.dataEntrada);
      const itemDataSaida = asDate(item.dataSaida);
      const itemDias = Number(item.dias);
      const valorDiaria = asMoney(item.valorDiaria);
      const valorTotal = asMoney(item.valorTotal);
      if (
        !Number.isInteger(petId) ||
        petId <= 0 ||
        !itemTipo ||
        !itemDataEntrada ||
        !itemDataSaida ||
        !Number.isInteger(itemDias) ||
        itemDias <= 0 ||
        valorDiaria === null ||
        valorTotal === null
      ) {
        throw new Error("Item de hospedagem inválido.");
      }

      petNames.push(petNome || `Pet ${petId}`);
      await conn.query(
        `
          INSERT INTO ${qtable(itensTable)}
            (${[
              qcol("solicitacao_id"),
              qcol("pet_id"),
              qcol("pet_nome"),
              qcol("tipo"),
              qcol("plano_id"),
              qcol("data_entrada"),
              qcol("data_saida"),
              qcol("dias"),
              qcol("valor_diaria"),
              qcol("valor_total"),
            ].join(", ")})
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          pedidoId,
          petId,
          petNome || null,
          itemTipo,
          planoId,
          itemDataEntrada,
          itemDataSaida,
          itemDias,
          valorDiaria,
          valorTotal,
        ],
      );
    }

    await conn.commit();

    const totalFormatado = Number(total).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    notifyAdmins(req, {
      login,
      tipo,
      dataEntrada,
      dataSaida,
      petNames,
      totalFormatado,
    }).catch((error) => {
      console.error("Erro notificando hospedagem no Telegram:", error);
    });

    return res.status(201).json({
      status: "sucesso",
      mensagem: "Solicitação de hospedagem enviada com sucesso.",
      solicitacao: { id: pedidoId, status: "pendente" },
    });
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // ignore rollback error
    }
    console.error("Error in POST /melpethostel/hospedagens/solicitacoes:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

module.exports = router;
