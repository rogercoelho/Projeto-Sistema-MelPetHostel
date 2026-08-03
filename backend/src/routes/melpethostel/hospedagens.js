const express = require("express");
const router = express.Router();
const {
  MODULE,
  sendTelegramToConfiguredAdmins,
} = require("../../utils/moduleAccessNotification");
const {
  TABLE_NAMES,
  dbFor,
  getCurrentClienteId,
  getReqLogin,
  qcol,
  qtable,
  resolveTableName,
} = require("./context");

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

function asStartMonth(value) {
  const text = clean(value);
  if (/^\d{4}-\d{2}$/.test(text)) return text;
  if (/^\d{2}\/\d{2}$/.test(text)) {
    const [month, year] = text.split("/");
    return `20${year}-${month}`;
  }
  return "";
}

function formatTelegramMonth(value) {
  const [year, month] = clean(value).split("-");
  if (!year || !month) return clean(value);
  return `${month}/${year.slice(-2)}`;
}

function asPositiveInteger(value, fallback = null) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return fallback;
}

function normalizeBillingMode(value) {
  const normalized = clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (normalized.includes("mes")) return "mensal";
  if (["mensal", "misto", "recorrente"].includes(normalized)) {
    return normalized;
  }
  return "unico";
}

function formatBillingMode(value) {
  const mode = normalizeBillingMode(value);
  if (mode === "unico") return "único";
  if (mode === "mensal") return "mensal";
  return "recorrente";
}

function formatTelegramDate(value) {
  const [year, month, day] = clean(value).split("-");
  if (!year || !month || !day) return clean(value);
  return `${day}/${month}/${year.slice(-2)}`;
}

async function notifyAdmins(req, pedido) {
  const db = dbFor(req);
  const periodLines =
    pedido.modoCobranca === "unico"
      ? [
          `Entrada: <b>${formatTelegramDate(pedido.dataEntrada)}</b>`,
          `Saída: <b>${formatTelegramDate(pedido.dataSaida)}</b>`,
          `Dias: <b>${pedido.dias}</b>`,
        ]
      : [
          `Início: <b>${formatTelegramMonth(pedido.inicioMes)}</b>`,
          `Recorrência: <b>${formatBillingMode(pedido.modoCobranca)}</b>`,
        ];

  const message = [
    "<b>Nova solicitação de hospedagem</b>",
    `Tutor: <b>${pedido.login}</b>`,
    `Tipo: <b>${pedido.tipo}</b>`,
    ...periodLines,
    `Pets: <b>${pedido.petDetails.join("; ")}</b>`,
    `Total: <b>${pedido.totalFormatado}</b>`,
  ].join("\n");

  return sendTelegramToConfiguredAdmins({
    db,
    module: MODULE,
    message,
    disabledReason: "notificacao_desativada",
  });
}

router.post("/hospedagens/solicitacoes", async (req, res) => {
  const conn = dbFor(req);

  try {
    const clienteId = await getCurrentClienteId(req);
    const login = getReqLogin(req);
    const tipo = clean(req.body?.tipo);
    const modoCobranca = normalizeBillingMode(req.body?.modoCobranca);
    const inicioMes = asStartMonth(req.body?.inicioMes);
    const dataEntrada = asDate(req.body?.dataEntrada);
    const dataSaida = modoCobranca === "unico" ? asDate(req.body?.dataSaida) : null;
    const dias = asPositiveInteger(req.body?.dias, modoCobranca === "unico" ? null : 1);
    const total = asMoney(req.body?.total);
    const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];

    if (!clienteId) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Cliente não identificado para solicitar hospedagem.",
      });
    }

    if (!tipo || !dataEntrada || !dias) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Informe tipo de hospedagem e período válidos.",
      });
    }

    if (modoCobranca === "unico" && !dataSaida) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Informe entrada e saída válidas.",
      });
    }

    if (modoCobranca !== "unico" && !inicioMes) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Informe o mês de início.",
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
            qcol("modo_cobranca"),
            qcol("inicio_mes"),
            qcol("data_entrada"),
            qcol("data_saida"),
            qcol("dias"),
            qcol("valor_total"),
            qcol("status"),
          ].join(", ")})
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendente')
      `,
      [clienteId, tipo, modoCobranca, inicioMes || null, dataEntrada, dataSaida, dias, total],
    );

    const pedidoId = pedidoResult.insertId;
    const petDetails = [];
    for (const item of itens) {
      const petId = Number(item.petId);
      const petNome = clean(item.petNome);
      const itemTipo = clean(item.tipo);
      const planoId = item.planoId ? Number(item.planoId) : null;
      const itemModoCobranca = normalizeBillingMode(item.modoCobranca);
      const tempoQuantidade = asPositiveInteger(item.tempoQuantidade, 1);
      const tempoUnidade = clean(item.tempoUnidade) || "dia";
      const itemInicioMes = asStartMonth(item.inicioMes);
      const itemDataEntrada = asDate(item.dataEntrada);
      const itemDataSaida =
        itemModoCobranca === "unico" ? asDate(item.dataSaida) : null;
      const itemDias = asPositiveInteger(
        item.dias,
        itemModoCobranca === "unico" ? null : 1,
      );
      const quantidadeSolicitada = asPositiveInteger(item.quantidadeSolicitada, 1);
      const valorDiaria = asMoney(item.valorDiaria);
      const valorTotal = asMoney(item.valorTotal);
      if (
        !Number.isInteger(petId) ||
        petId <= 0 ||
        !itemTipo ||
        !itemModoCobranca ||
        !tempoQuantidade ||
        !tempoUnidade ||
        !itemDataEntrada ||
        (itemModoCobranca === "unico" && !itemDataSaida) ||
        (itemModoCobranca !== "unico" && !itemInicioMes) ||
        !itemDias ||
        !quantidadeSolicitada ||
        valorDiaria === null ||
        valorTotal === null
      ) {
        throw new Error("Item de hospedagem inválido.");
      }

      petDetails.push(
        `${petNome || `Pet ${petId}`}: ${itemTipo} / ${quantidadeSolicitada} ${tempoUnidade}`,
      );
      await conn.query(
        `
          INSERT INTO ${qtable(itensTable)}
            (${[
              qcol("solicitacao_id"),
              qcol("pet_id"),
              qcol("pet_nome"),
              qcol("tipo"),
              qcol("plano_id"),
              qcol("modo_cobranca"),
              qcol("tempo_quantidade"),
              qcol("tempo_unidade"),
              qcol("inicio_mes"),
              qcol("data_entrada"),
              qcol("data_saida"),
              qcol("dias"),
              qcol("valor_diaria"),
              qcol("valor_total"),
            ].join(", ")})
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          pedidoId,
          petId,
          petNome || null,
          itemTipo,
          planoId,
          itemModoCobranca,
          tempoQuantidade,
          tempoUnidade,
          itemInicioMes || null,
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
      modoCobranca,
      dataEntrada,
      dataSaida,
      inicioMes,
      dias,
      petDetails,
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
