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
  isAdminUser,
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

function formatTelegramMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return clean(value);
  return number.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function buildHostingTelegramMessage({
  header,
  login,
  tipo,
  items,
  totalFormatado,
}) {
  const itemBlocks = (items || []).map((item) => {
    const periodLines =
      item.modoCobranca === "unico"
        ? [
            `Entrada: <b>${formatTelegramDate(item.dataEntrada)}</b>`,
            `Saída: <b>${formatTelegramDate(item.dataSaida)}</b>`,
            `Dias: <b>${item.dias}</b>`,
          ]
        : [
            `Início: <b>${formatTelegramMonth(item.inicioMes)}</b>`,
            `Recorrência: <b>${formatBillingMode(item.modoCobranca)}</b>`,
          ];

    return [
      `Pet: <b>${clean(item.petNome) || `Pet ${item.petId}`}</b>`,
      `Serviço: <b>${clean(tipo)}</b>`,
      `Tipo: <b>${item.tipo} / ${item.quantidadeSolicitada} ${item.tempoUnidade} -> ${formatTelegramMoney(item.valorDiaria)}</b>`,
      ...periodLines,
    ];
  });

  return [
    header,
    `Tutor: <b>${clean(login)}</b>`,
    ...itemBlocks.flat(),
    `Total: <b>${clean(totalFormatado)}</b>`,
  ].join("\n");
}

async function loadHostingRequestById(req, solicitacaoId) {
  const db = dbFor(req);
  const solicitacoesTable = await resolveTableName(
    req,
    TABLE_NAMES.hospedagemSolicitacoes,
  );
  const itensTable = await resolveTableName(
    req,
    TABLE_NAMES.hospedagemSolicitacaoItens,
  );

  if (!solicitacoesTable || !itensTable) return null;

  const [rows] = await db.query(
    `
      SELECT
        s.id AS solicitacao_id,
        s.tipo AS solicitacao_tipo,
        s.modo_cobranca AS solicitacao_modo_cobranca,
        s.inicio_mes AS solicitacao_inicio_mes,
        s.data_entrada AS solicitacao_data_entrada,
        s.data_saida AS solicitacao_data_saida,
        s.dias AS solicitacao_dias,
        s.valor_total AS solicitacao_valor_total,
        s.desconto_valor AS solicitacao_desconto_valor,
        s.valor_final AS solicitacao_valor_final,
        s.status AS solicitacao_status,
        s.motivo_recusa AS solicitacao_motivo_recusa,
        s.analisado_por AS solicitacao_analisado_por,
        s.analisado_em AS solicitacao_analisado_em,
        s.criado_em AS solicitacao_criado_em,
        s.atualizado_em AS solicitacao_atualizado_em,
        i.id AS item_id,
        i.pet_id AS item_pet_id,
        i.pet_nome AS item_pet_nome,
        i.tipo AS item_tipo,
        i.plano_id AS item_plano_id,
        i.modo_cobranca AS item_modo_cobranca,
        i.tempo_quantidade AS item_tempo_quantidade,
        i.tempo_unidade AS item_tempo_unidade,
        i.inicio_mes AS item_inicio_mes,
        i.data_entrada AS item_data_entrada,
        i.data_saida AS item_data_saida,
        i.dias AS item_dias,
        i.valor_diaria AS item_valor_diaria,
        i.valor_total AS item_valor_total
      FROM ${qtable(solicitacoesTable)} s
      LEFT JOIN ${qtable(itensTable)} i ON i.solicitacao_id = s.id
      WHERE s.id = ?
      ORDER BY i.id ASC
    `,
    [solicitacaoId],
  );

  const solicitacoesById = new Map();
  for (const row of rows || []) {
    const id = Number(row.solicitacao_id);
    if (!solicitacoesById.has(id)) {
      solicitacoesById.set(id, {
        id,
        tipo: row.solicitacao_tipo,
        modoCobranca: row.solicitacao_modo_cobranca,
        inicioMes: row.solicitacao_inicio_mes,
        dataEntrada: row.solicitacao_data_entrada,
        dataSaida: row.solicitacao_data_saida,
        dias: row.solicitacao_dias,
        valorTotal: row.solicitacao_valor_total,
        descontoValor: row.solicitacao_desconto_valor,
        valorFinal: row.solicitacao_valor_final,
        status: row.solicitacao_status,
        motivoRecusa: row.solicitacao_motivo_recusa,
        analisadoPor: row.solicitacao_analisado_por,
        analisadoEm: row.solicitacao_analisado_em,
        criadoEm: row.solicitacao_criado_em,
        atualizadoEm: row.solicitacao_atualizado_em,
        itens: [],
      });
    }

    if (row.item_id !== null && row.item_id !== undefined) {
      solicitacoesById.get(id).itens.push({
        id: Number(row.item_id),
        petId: row.item_pet_id,
        petNome: row.item_pet_nome,
        tipo: row.item_tipo,
        planoId: row.item_plano_id,
        modoCobranca: row.item_modo_cobranca,
        tempoQuantidade: row.item_tempo_quantidade,
        tempoUnidade: row.item_tempo_unidade,
        inicioMes: row.item_inicio_mes,
        dataEntrada: row.item_data_entrada,
        dataSaida: row.item_data_saida,
        dias: row.item_dias,
        valorDiaria: row.item_valor_diaria,
        valorTotal: row.item_valor_total,
      });
    }
  }

  return solicitacoesById.get(Number(solicitacaoId)) || null;
}

async function notifyAdmins(req, pedido) {
  const db = dbFor(req);
  const message = buildHostingTelegramMessage({
    header: "Nova solicitação de hospedagem",
    login: pedido.login,
    tipo: pedido.tipo,
    items: pedido.items,
    totalFormatado: pedido.totalFormatado,
  });

  return sendTelegramToConfiguredAdmins({
    db,
    module: MODULE,
    message,
    disabledReason: "notificacao_desativada",
  });
}

function normalizeHostingStatus(value) {
  const normalized = clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (["aprovado", "aprovada"].includes(normalized)) return "aprovado";
  if (
    ["aguardando pagamento", "aguardando_pagamento", "pagamento"].includes(
      normalized,
    )
  ) {
    return "aguardando_pagamento";
  }
  if (["confirmado", "confirmada"].includes(normalized)) return "confirmado";
  if (["concluido", "concluida"].includes(normalized)) return "concluido";
  if (["recusado", "recusada", "reprovado", "reprovada"].includes(normalized)) return "recusado";
  if (["cancelado", "cancelada"].includes(normalized)) return "cancelado";
  return "pendente";
}

function getHostingStatusLabel(status) {
  const normalized = normalizeHostingStatus(status);
  if (normalized === "aprovado") return "Aprovado";
  if (normalized === "aguardando_pagamento") return "Aguardando pagamento";
  if (normalized === "confirmado") return "Confirmado";
  if (normalized === "concluido") return "Concluído";
  if (normalized === "cancelado") return "Cancelado";
  return "Pendente";
}

function getAllowedHostingStatusTransition(status) {
  const normalized = normalizeHostingStatus(status);
  if (normalized === "pendente" || normalized === "aguardando_pagamento") {
    return "cancelado";
  }
  return "";
}

async function requireHostingAdmin(req, res) {
  const login = getReqLogin(req);
  if (!(await isAdminUser(req, login))) {
    res.status(403).json({ status: "erro", mensagem: "Apenas administradores podem executar esta acao." });
    return false;
  }
  return true;
}

function mapHostingRows(rows) {
  const solicitacoesById = new Map();
  for (const row of rows || []) {
    const solicitacaoId = Number(row.solicitacao_id);
    if (!solicitacoesById.has(solicitacaoId)) {
      solicitacoesById.set(solicitacaoId, {
        id: solicitacaoId,
        clienteId: row.solicitacao_cliente_id,
        clienteNome: row.cliente_nome,
        usuarioLogin: row.usuario_login,
        tipo: row.solicitacao_tipo,
        modoCobranca: row.solicitacao_modo_cobranca,
        inicioMes: row.solicitacao_inicio_mes,
        dataEntrada: row.solicitacao_data_entrada,
        dataSaida: row.solicitacao_data_saida,
        dias: row.solicitacao_dias,
        valorTotal: row.solicitacao_valor_total,
        descontoValor: row.solicitacao_desconto_valor,
        valorFinal: row.solicitacao_valor_final,
        status: row.solicitacao_status,
        motivoRecusa: row.solicitacao_motivo_recusa,
        analisadoPor: row.solicitacao_analisado_por,
        analisadoEm: row.solicitacao_analisado_em,
        criadoEm: row.solicitacao_criado_em,
        atualizadoEm: row.solicitacao_atualizado_em,
        itens: [],
      });
    }
    if (row.item_id !== null && row.item_id !== undefined) {
      solicitacoesById.get(solicitacaoId).itens.push({
        id: Number(row.item_id),
        petId: row.item_pet_id,
        petNome: row.item_pet_nome,
        tipo: row.item_tipo,
        planoId: row.item_plano_id,
        modoCobranca: row.item_modo_cobranca,
        tempoQuantidade: row.item_tempo_quantidade,
        tempoUnidade: row.item_tempo_unidade,
        inicioMes: row.item_inicio_mes,
        dataEntrada: row.item_data_entrada,
        dataSaida: row.item_data_saida,
        dias: row.item_dias,
        valorDiaria: row.item_valor_diaria,
        valorTotal: row.item_valor_total,
      });
    }
  }
  return Array.from(solicitacoesById.values());
}

async function listHostingRequests(req, { clienteId = null, status = "" } = {}) {
  const db = dbFor(req);
  const solicitacoesTable = await resolveTableName(req, TABLE_NAMES.hospedagemSolicitacoes);
  const itensTable = await resolveTableName(req, TABLE_NAMES.hospedagemSolicitacaoItens);
  if (!solicitacoesTable || !itensTable) return null;
  const where = [];
  const params = [];
  if (clienteId) { where.push("s.cliente_id = ?"); params.push(clienteId); }
  if (status) { where.push("LOWER(TRIM(s.status)) = LOWER(TRIM(?))"); params.push(status); }
  const sql = `
      SELECT
        s.id AS solicitacao_id,
        s.cliente_id AS solicitacao_cliente_id,
        c.nome AS cliente_nome,
        u.usuario_login AS usuario_login,
        s.tipo AS solicitacao_tipo,
        s.modo_cobranca AS solicitacao_modo_cobranca,
        s.inicio_mes AS solicitacao_inicio_mes,
        s.data_entrada AS solicitacao_data_entrada,
        s.data_saida AS solicitacao_data_saida,
        s.dias AS solicitacao_dias,
        s.valor_total AS solicitacao_valor_total,
        s.desconto_valor AS solicitacao_desconto_valor,
        s.valor_final AS solicitacao_valor_final,
        s.status AS solicitacao_status,
        s.motivo_recusa AS solicitacao_motivo_recusa,
        s.analisado_por AS solicitacao_analisado_por,
        s.analisado_em AS solicitacao_analisado_em,
        s.criado_em AS solicitacao_criado_em,
        s.atualizado_em AS solicitacao_atualizado_em,
        i.id AS item_id,
        i.pet_id AS item_pet_id,
        i.pet_nome AS item_pet_nome,
        i.tipo AS item_tipo,
        i.plano_id AS item_plano_id,
        i.modo_cobranca AS item_modo_cobranca,
        i.tempo_quantidade AS item_tempo_quantidade,
        i.tempo_unidade AS item_tempo_unidade,
        i.inicio_mes AS item_inicio_mes,
        i.data_entrada AS item_data_entrada,
        i.data_saida AS item_data_saida,
        i.dias AS item_dias,
        i.valor_diaria AS item_valor_diaria,
        i.valor_total AS item_valor_total
      FROM ${qtable(solicitacoesTable)} s
      LEFT JOIN ${qtable(itensTable)} i ON i.solicitacao_id = s.id
      LEFT JOIN Clientes c ON c.id = s.cliente_id
      LEFT JOIN Usuarios u ON u.cliente_id = s.cliente_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY s.criado_em DESC, i.id ASC
    `;
  const [rows] = await db.query(sql, params);
  return mapHostingRows(rows);
}

router.get("/hospedagens/solicitacoes/pendentes", async (req, res) => {
  try {
    if (!(await requireHostingAdmin(req, res))) return;
    const solicitacoes = await listHostingRequests(req, { status: "pendente" });
    if (!solicitacoes) return res.status(500).json({ status: "erro", mensagem: "Tabelas de hospedagem nao encontradas. Execute create_hospedagens_schema.sql." });
    return res.json({ status: "sucesso", total: solicitacoes.length, solicitacoes });
  } catch (error) {
    console.error("Error in GET /melpethostel/hospedagens/solicitacoes/pendentes:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.patch("/hospedagens/solicitacoes/:id/aprovar", async (req, res) => {
  try {
    if (!(await requireHostingAdmin(req, res))) return;
    const solicitacaoId = Number(req.params?.id);
    if (!Number.isInteger(solicitacaoId) || solicitacaoId <= 0) return res.status(400).json({ status: "erro", mensagem: "Solicitacao invalida." });
    const table = await resolveTableName(req, TABLE_NAMES.hospedagemSolicitacoes);
    if (!table) return res.status(500).json({ status: "erro", mensagem: "Tabela de hospedagem nao encontrada." });
    const [rows] = await dbFor(req).query(`SELECT id, status FROM ${qtable(table)} WHERE id = ? LIMIT 1`, [solicitacaoId]);
    const solicitacao = rows && rows[0] ? rows[0] : null;
    if (!solicitacao) return res.status(404).json({ status: "erro", mensagem: "Solicitacao nao encontrada." });
    if (normalizeHostingStatus(solicitacao.status) !== "pendente") return res.status(409).json({ status: "erro", mensagem: "A solicitacao nao esta pendente." });
    await dbFor(req).query(`UPDATE ${qtable(table)} SET status = ?, analisado_por = ?, analisado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`, ["aprovado", getReqLogin(req), solicitacaoId]);
    return res.json({ status: "sucesso", mensagem: "Hospedagem aprovada com sucesso.", solicitacao: { id: solicitacaoId, status: "aprovado" } });
  } catch (error) {
    console.error("Error in PATCH /melpethostel/hospedagens/solicitacoes/:id/aprovar:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.patch("/hospedagens/solicitacoes/:id/reprovar", async (req, res) => {
  try {
    if (!(await requireHostingAdmin(req, res))) return;
    const solicitacaoId = Number(req.params?.id);
    const motivoRecusa = clean(req.body?.motivoRecusa || req.body?.motivoReprovacao);
    if (!Number.isInteger(solicitacaoId) || solicitacaoId <= 0) return res.status(400).json({ status: "erro", mensagem: "Solicitacao invalida." });
    if (!motivoRecusa) return res.status(400).json({ status: "erro", mensagem: "Informe o motivo da reprovacao." });
    const table = await resolveTableName(req, TABLE_NAMES.hospedagemSolicitacoes);
    if (!table) return res.status(500).json({ status: "erro", mensagem: "Tabela de hospedagem nao encontrada." });
    const [rows] = await dbFor(req).query(`SELECT id, status FROM ${qtable(table)} WHERE id = ? LIMIT 1`, [solicitacaoId]);
    const solicitacao = rows && rows[0] ? rows[0] : null;
    if (!solicitacao) return res.status(404).json({ status: "erro", mensagem: "Solicitacao nao encontrada." });
    if (normalizeHostingStatus(solicitacao.status) !== "pendente") return res.status(409).json({ status: "erro", mensagem: "A solicitacao nao esta pendente." });
    await dbFor(req).query(`UPDATE ${qtable(table)} SET status = ?, motivo_recusa = ?, analisado_por = ?, analisado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`, ["recusado", motivoRecusa, getReqLogin(req), solicitacaoId]);
    return res.json({ status: "sucesso", mensagem: "Hospedagem reprovada com sucesso.", solicitacao: { id: solicitacaoId, status: "recusado", motivoRecusa } });
  } catch (error) {
    console.error("Error in PATCH /melpethostel/hospedagens/solicitacoes/:id/reprovar:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});
router.get("/hospedagens/solicitacoes", async (req, res) => {
  const db = dbFor(req);

  try {
    const clienteId = await getCurrentClienteId(req);
    if (!clienteId) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Cliente não identificado para consultar hospedagens.",
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

    const [rows] = await db.query(
      `
        SELECT
          s.id AS solicitacao_id,
          s.tipo AS solicitacao_tipo,
          s.modo_cobranca AS solicitacao_modo_cobranca,
          s.inicio_mes AS solicitacao_inicio_mes,
          s.data_entrada AS solicitacao_data_entrada,
          s.data_saida AS solicitacao_data_saida,
          s.dias AS solicitacao_dias,
          s.valor_total AS solicitacao_valor_total,
          s.desconto_valor AS solicitacao_desconto_valor,
          s.valor_final AS solicitacao_valor_final,
          s.status AS solicitacao_status,
          s.motivo_recusa AS solicitacao_motivo_recusa,
          s.analisado_por AS solicitacao_analisado_por,
          s.analisado_em AS solicitacao_analisado_em,
          s.criado_em AS solicitacao_criado_em,
          s.atualizado_em AS solicitacao_atualizado_em,
          i.id AS item_id,
          i.pet_id AS item_pet_id,
          i.pet_nome AS item_pet_nome,
          i.tipo AS item_tipo,
          i.plano_id AS item_plano_id,
          i.modo_cobranca AS item_modo_cobranca,
          i.tempo_quantidade AS item_tempo_quantidade,
          i.tempo_unidade AS item_tempo_unidade,
          i.inicio_mes AS item_inicio_mes,
          i.data_entrada AS item_data_entrada,
          i.data_saida AS item_data_saida,
          i.dias AS item_dias,
          i.valor_diaria AS item_valor_diaria,
          i.valor_total AS item_valor_total
        FROM ${qtable(solicitacoesTable)} s
        LEFT JOIN ${qtable(itensTable)} i ON i.solicitacao_id = s.id
        WHERE s.cliente_id = ?
        ORDER BY s.criado_em DESC, i.id ASC
      `,
      [clienteId],
    );

    const solicitacoesById = new Map();
    for (const row of rows || []) {
      const solicitacaoId = Number(row.solicitacao_id);
      if (!solicitacoesById.has(solicitacaoId)) {
        solicitacoesById.set(solicitacaoId, {
          id: solicitacaoId,
          tipo: row.solicitacao_tipo,
          modoCobranca: row.solicitacao_modo_cobranca,
          inicioMes: row.solicitacao_inicio_mes,
          dataEntrada: row.solicitacao_data_entrada,
          dataSaida: row.solicitacao_data_saida,
          dias: row.solicitacao_dias,
          valorTotal: row.solicitacao_valor_total,
          descontoValor: row.solicitacao_desconto_valor,
          valorFinal: row.solicitacao_valor_final,
          status: row.solicitacao_status,
          motivoRecusa: row.solicitacao_motivo_recusa,
          analisadoPor: row.solicitacao_analisado_por,
          analisadoEm: row.solicitacao_analisado_em,
          criadoEm: row.solicitacao_criado_em,
          atualizadoEm: row.solicitacao_atualizado_em,
          itens: [],
        });
      }

      if (row.item_id !== null && row.item_id !== undefined) {
        solicitacoesById.get(solicitacaoId).itens.push({
          id: Number(row.item_id),
          petId: row.item_pet_id,
          petNome: row.item_pet_nome,
          tipo: row.item_tipo,
          planoId: row.item_plano_id,
          modoCobranca: row.item_modo_cobranca,
          tempoQuantidade: row.item_tempo_quantidade,
          tempoUnidade: row.item_tempo_unidade,
          inicioMes: row.item_inicio_mes,
          dataEntrada: row.item_data_entrada,
          dataSaida: row.item_data_saida,
          dias: row.item_dias,
          valorDiaria: row.item_valor_diaria,
          valorTotal: row.item_valor_total,
        });
      }
    }

    return res.json({
      status: "sucesso",
      solicitacoes: Array.from(solicitacoesById.values()),
    });
  } catch (error) {
    console.error(
      "Error in GET /melpethostel/hospedagens/solicitacoes:",
      error,
    );
    return res.status(500).json({
      status: "erro",
      mensagem: error.message,
    });
  }
});

router.patch("/hospedagens/solicitacoes/:id/cancelar", async (req, res) => {
  const db = dbFor(req);

  try {
    const clienteId = await getCurrentClienteId(req);
    const solicitacaoId = Number(req.params?.id);

    if (!clienteId) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Cliente não identificado para cancelar hospedagem.",
      });
    }

    if (!Number.isInteger(solicitacaoId) || solicitacaoId <= 0) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Solicitação inválida.",
      });
    }

    const solicitacoesTable = await resolveTableName(
      req,
      TABLE_NAMES.hospedagemSolicitacoes,
    );
    if (!solicitacoesTable) {
      return res.status(500).json({
        status: "erro",
        mensagem:
          "Tabela de hospedagem não encontrada. Execute create_hospedagens_schema.sql.",
      });
    }

    const [rows] = await db.query(
      `
        SELECT id, status
        FROM ${qtable(solicitacoesTable)}
        WHERE id = ? AND cliente_id = ?
        LIMIT 1
      `,
      [solicitacaoId, clienteId],
    );

    const solicitacao = rows && rows[0] ? rows[0] : null;
    if (!solicitacao) {
      return res.status(404).json({
        status: "erro",
        mensagem: "Solicitação não encontrada.",
      });
    }

    const nextStatus = getAllowedHostingStatusTransition(solicitacao.status);
    if (!nextStatus) {
      return res.status(409).json({
        status: "erro",
        mensagem: "A solicitação não pode ser cancelada neste momento.",
      });
    }

    await db.query(
      `
        UPDATE ${qtable(solicitacoesTable)}
        SET status = ?, atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ? AND cliente_id = ?
      `,
      [nextStatus, solicitacaoId, clienteId],
    );

    const pedidoCompleto = await loadHostingRequestById(req, solicitacaoId);
    if (pedidoCompleto) {
      const totalFormatado = Number(
        pedidoCompleto.valorFinal ?? pedidoCompleto.valorTotal ?? 0,
      ).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

      const message = buildHostingTelegramMessage({
        header: "=== PEDIDO CANCELADO ===",
        login: getReqLogin(req),
        tipo: pedidoCompleto.tipo,
        items: pedidoCompleto.itens,
        totalFormatado,
      });

      await sendTelegramToConfiguredAdmins({
        db,
        module: MODULE,
        message,
        disabledReason: "notificacao_desativada",
      }).catch((error) => {
        console.error(
          "Erro notificando cancelamento de hospedagem no Telegram:",
          error,
        );
      });
    }

    return res.json({
      status: "sucesso",
      mensagem: "Solicitação cancelada com sucesso.",
      solicitacao: { id: solicitacaoId, status: nextStatus },
    });
  } catch (error) {
    console.error(
      "Error in PATCH /melpethostel/hospedagens/solicitacoes/:id/cancelar:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post("/hospedagens/solicitacoes", async (req, res) => {
  const conn = dbFor(req);

  try {
    const clienteId = await getCurrentClienteId(req);
    const login = getReqLogin(req);
    const tipo = clean(req.body?.tipo);
    const modoCobranca = normalizeBillingMode(req.body?.modoCobranca);
    const inicioMes = asStartMonth(req.body?.inicioMes);
    const dataEntrada = asDate(req.body?.dataEntrada);
    const dataSaida =
      modoCobranca === "unico" ? asDate(req.body?.dataSaida) : null;
    const dias = asPositiveInteger(
      req.body?.dias,
      modoCobranca === "unico" ? null : 1,
    );
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
      [
        clienteId,
        tipo,
        modoCobranca,
        inicioMes || null,
        dataEntrada,
        dataSaida,
        dias,
        total,
      ],
    );

    const pedidoId = pedidoResult.insertId;
    const itemsForNotification = [];
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
      const quantidadeSolicitada = asPositiveInteger(
        item.quantidadeSolicitada,
        1,
      );
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

      itemsForNotification.push({
        petId,
        petNome,
        tipo: itemTipo,
        modoCobranca: itemModoCobranca,
        quantidadeSolicitada,
        tempoUnidade,
        inicioMes: itemInicioMes,
        dataEntrada: itemDataEntrada,
        dataSaida: itemDataSaida,
        dias: itemDias,
        valorDiaria,
        valorTotal,
      });
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
      items: itemsForNotification,
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
    console.error(
      "Error in POST /melpethostel/hospedagens/solicitacoes:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

module.exports = router;
