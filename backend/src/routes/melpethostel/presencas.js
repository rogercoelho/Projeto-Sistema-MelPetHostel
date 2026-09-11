const express = require("express");
const router = express.Router();
const {
  TABLE_NAMES,
  dbFor,
  getCurrentClienteId,
  getReqLogin,
  isAdminUser,
  qtable,
  resolveTableName,
} = require("./context");

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}


function isValidCompetence(value) {
  return /^\d{4}-\d{2}$/.test(clean(value));
}

function isValidDate(value) {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

function getCompetenceFromDate(value) {
  return clean(value).slice(0, 7);
}

function getDaysInCompetence(competence) {
  const [year, month] = clean(competence).split("-").map(Number);
  if (!year || !month) return 0;
  return new Date(year, month, 0).getDate();
}

function getCurrentPresenceDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function getIsoDate(value) {
  const match = clean(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function getDateParts(value) {
  const match = getIsoDate(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null;
}

function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

function getMonthDate(year, month, day) {
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(day, maxDay)));
}

function getPresenceCycle(requestDate, competence) {
  const anchor = getDateParts(requestDate);
  const match = clean(competence).match(/^(\d{4})-(\d{2})$/);
  if (!anchor || !match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = getMonthDate(year, month, anchor.day);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextStart = getMonthDate(nextYear, nextMonth, anchor.day);
  const end = new Date(nextStart.getTime() - 86400000);
  return {
    inicio: formatUtcDate(start),
    fim: formatUtcDate(end),
  };
}

function isDateInPresenceCycle(date, cycle) {
  const target = getIsoDate(date);
  return Boolean(target && cycle?.inicio && cycle?.fim && target >= cycle.inicio && target <= cycle.fim);
}

function getPresenceCycleDays(row) {
  const start = getDateParts(row?.cicloInicio);
  const end = getDateParts(row?.cicloFim);
  if (!start || !end) return getDaysInCompetence(row?.competencia);
  const startDate = Date.UTC(start.year, start.month - 1, start.day);
  const endDate = Date.UTC(end.year, end.month - 1, end.day);
  return endDate >= startDate ? Math.floor((endDate - startDate) / 86400000) + 1 : 0;
}

function getPresenceCycleWeeks(row) {
  const days = getPresenceCycleDays(row);
  return days > 0 ? Math.ceil(days / 7) : 0;
}

function normalizeText(value) {
  return clean(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}


function getContractedDays(row) {
  const quantity = Number(row.tempo_quantidade);
  const unit = normalizeText(row.tempo_unidade);
  if (Number.isFinite(quantity) && quantity > 0) {
    const normalizedQuantity = Math.trunc(quantity);
    if (unit.includes("semana")) return normalizedQuantity * getPresenceCycleWeeks(row);
    if (unit.includes("mes")) return normalizedQuantity * getDaysInCompetence(row.competencia);
    return normalizedQuantity;
  }
  const requestDays = Number(row.solicitacao_dias);
  if (Number.isFinite(requestDays) && requestDays > 0) return Math.trunc(requestDays);
  return getDaysInCompetence(row.competencia);
}

function getDefaultPresenceBilling(row, diasUsados) {
  const diasContratados = getContractedDays(row);
  return {
    diasContratados,
    diasUsados,
    diasRestantes: Math.max(0, diasContratados - diasUsados),
    diasExcedentes: Math.max(0, diasUsados - diasContratados),
    limiteDias: diasContratados,
    limiteAtingido: diasUsados >= diasContratados,
    valorBase: roundMoney(row.item_valor_total || row.mensalidade_valor || 0),
    valorExcedente: 0,
    valorTotalComExcedente: roundMoney(row.item_valor_total || row.mensalidade_valor || 0),
    faixasExcedentes: [],
  };
}

async function getCrechePresenceBilling(req, row, diasUsados) {
  const base = getDefaultPresenceBilling(row, diasUsados);
  if (!normalizeText(row.solicitacao_tipo || row.item_tipo).includes("creche")) return base;

  const planosTable = await resolveTableName(req, TABLE_NAMES.planos);
  if (!planosTable) return base;

  const selectedQuantity = Number(row.tempo_quantidade);
  const selectedPlanId = Number(row.plano_id);
  if (!Number.isFinite(selectedQuantity) || selectedQuantity <= 0) return base;

  const db = dbFor(req);
  const [selectedPlanRows] = Number.isInteger(selectedPlanId) && selectedPlanId > 0
    ? await db.query(
        `SELECT categoria_de, categoria_ate, unidade FROM ${qtable(planosTable)} WHERE id = ? LIMIT 1`,
        [selectedPlanId],
      )
    : [[]];
  const selectedPlan = selectedPlanRows?.[0] || null;
  const categoryWhere = selectedPlan
    ? " AND categoria_de = ? AND categoria_ate = ? AND unidade = ?"
    : "";
  const categoryParams = selectedPlan
    ? [selectedPlan.categoria_de, selectedPlan.categoria_ate, selectedPlan.unidade]
    : [];

  const [planRows] = await db.query(
    `
      SELECT id, tipo, categoria_de, categoria_ate, unidade, tipo_cobranca, tempo_quantidade, tempo_unidade, valor, ativo
      FROM ${qtable(planosTable)}
      WHERE ativo = 1 AND LOWER(tipo) LIKE '%creche%'${categoryWhere}
      ORDER BY tempo_quantidade ASC, valor ASC, id ASC
    `,
    categoryParams,
  );

  const normalizedUnit = normalizeText(row.tempo_unidade);
  const plans = (planRows || [])
    .map((plan) => ({
      id: Number(plan.id),
      quantity: Number(plan.tempo_quantidade),
      unit: normalizeText(plan.tempo_unidade),
      billing: normalizeText(plan.tipo_cobranca),
      value: Number(plan.valor),
    }))
    .filter(
      (plan) =>
        Number.isFinite(plan.quantity) &&
        plan.quantity > 0 &&
        Number.isFinite(plan.value) &&
        plan.value >= 0 &&
        plan.unit.includes("semana") &&
        normalizedUnit.includes("semana") &&
        (plan.billing.includes("mensal") || plan.billing.includes("mes")),
    )
    .sort((a, b) => a.quantity - b.quantity || a.value - b.value || a.id - b.id);

  const weeks = getPresenceCycleWeeks(row);
  const baseDays = selectedQuantity * weeks;
  const baseValue = roundMoney(row.item_valor_total || row.mensalidade_valor || 0);
  const higherPlans = plans.filter((plan) => plan.quantity > selectedQuantity);
  const maxPlan = higherPlans.at(-1) || plans.find((plan) => plan.quantity === selectedQuantity);
  const limitDays = maxPlan ? maxPlan.quantity * weeks : baseDays;
  let remainingExtraDays = Math.max(0, diasUsados - baseDays);
  let previousQuantity = selectedQuantity;
  let extraValue = 0;
  const extraTiers = [];

  for (const plan of higherPlans) {
    if (remainingExtraDays <= 0) break;
    const tierCapacity = Math.max(0, (plan.quantity - previousQuantity) * weeks);
    if (!tierCapacity) {
      previousQuantity = plan.quantity;
      continue;
    }
    const usedInTier = Math.min(remainingExtraDays, tierCapacity);
    const tierValue = roundMoney(plan.value);
    const planMonthlyDays = plan.quantity * weeks;
    const dailyValue = planMonthlyDays > 0 ? roundMoney(tierValue / planMonthlyDays) : 0;
    const tierCharge = roundMoney(dailyValue * usedInTier);
    extraValue = roundMoney(extraValue + tierCharge);
    extraTiers.push({
      planoQuantidade: plan.quantity,
      tempoUnidade: "semana",
      diasUsados: usedInTier,
      diasDoPlano: planMonthlyDays,
      valorFaixa: tierCharge,
      valorDia: dailyValue,
    });
    remainingExtraDays -= usedInTier;
    previousQuantity = plan.quantity;
  }

  return {
    faixaBase: { planoQuantidade: selectedQuantity, diasUsados: Math.min(diasUsados, baseDays), diasDoPlano: baseDays, valorFaixa: baseValue, valorDia: baseDays > 0 ? roundMoney(baseValue / baseDays) : 0 },
    diasContratados: baseDays,
    diasUsados,
    diasRestantes: Math.max(0, baseDays - diasUsados),
    diasExcedentes: Math.max(0, diasUsados - baseDays),
    limiteDias: limitDays,
    limiteAtingido: limitDays > 0 && diasUsados >= limitDays,
    valorBase: baseValue,
    valorExcedente: extraValue,
    valorTotalComExcedente: roundMoney(baseValue + extraValue),
    faixasExcedentes: extraTiers,
  };
}
async function ensurePresenceTable(req) {
  await dbFor(req).query(
    "CREATE TABLE IF NOT EXISTS " +
      qtable(TABLE_NAMES.petPresencas) +
      " (" +
      "id INT NOT NULL AUTO_INCREMENT," +
      "pet_id INT NOT NULL," +
      "cliente_id INT NOT NULL," +
      "solicitacao_id INT NOT NULL," +
      "mensalidade_id INT NOT NULL," +
      "competencia CHAR(7) NOT NULL," +
      "data_presenca DATE NOT NULL," +
      "registrado_por VARCHAR(120) NULL," +
      "criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "PRIMARY KEY (id)," +
      "UNIQUE KEY uk_pet_presenca_dia (pet_id, competencia, data_presenca)," +
      "INDEX idx_pet_presenca_cliente (cliente_id)," +
      "INDEX idx_pet_presenca_mensalidade (mensalidade_id)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  );
}

async function requirePresenceAdmin(req, res) {
  const login = getReqLogin(req);
  if (!(await isAdminUser(req, login))) {
    res.status(403).json({ status: "erro", mensagem: "Apenas administradores podem registrar presenca." });
    return false;
  }
  return true;
}

async function listPresencePets(req, { clienteId = null } = {}) {
  await ensurePresenceTable(req);
  const db = dbFor(req);
  const petsTable = await resolveTableName(req, TABLE_NAMES.pets);
  const clientesTable = await resolveTableName(req, TABLE_NAMES.clientes);
  const solicitacoesTable = await resolveTableName(req, TABLE_NAMES.hospedagemSolicitacoes);
  const itensTable = await resolveTableName(req, TABLE_NAMES.hospedagemSolicitacaoItens);
  if (!petsTable || !clientesTable || !solicitacoesTable || !itensTable) return [];

  const params = [];
  const where = [
    "LOWER(s.status) = 'confirmado'",
    "LOWER(COALESCE(s.tipo, i.tipo, '')) LIKE '%creche%'",
    "LOWER(COALESCE(s.modo_cobranca, i.modo_cobranca, '')) = 'mensal'",
    "LOWER(m.status) IN ('confirmado', 'cancelamento_solicitado')",
    "LOWER(p.status) = 'confirmado'",
  ];
  if (clienteId) {
    where.push("p2.cliente_id = ?");
    params.push(clienteId);
  }

  const [rows] = await db.query(
    `
      SELECT
        p2.id AS pet_id,
        p2.nome AS pet_nome,
        p2.cliente_id,
        c.nome AS cliente_nome,
        m.competencia,
        DATE(s.criado_em) AS solicitacao_data_pedido
      FROM ${qtable(TABLE_NAMES.hospedagemMensalidades)} m
      INNER JOIN ${qtable(TABLE_NAMES.hospedagemPagamentos)} p ON p.id = m.pagamento_id
      INNER JOIN ${qtable(solicitacoesTable)} s ON s.id = m.solicitacao_id
      INNER JOIN ${qtable(itensTable)} i ON i.solicitacao_id = s.id
      INNER JOIN ${qtable(petsTable)} p2 ON p2.id = i.pet_id
      INNER JOIN ${qtable(clientesTable)} c ON c.id = p2.cliente_id
      WHERE ${where.join(" AND ")}
      ORDER BY c.nome ASC, p2.nome ASC, m.competencia DESC
    `,
    params,
  );

  const today = getCurrentPresenceDate();
  const activePets = new Map();
  for (const row of rows || []) {
    const cycle = getPresenceCycle(row.solicitacao_data_pedido, row.competencia);
    const petId = Number(row.pet_id);
    if (!petId || !isDateInPresenceCycle(today, cycle) || activePets.has(petId)) continue;
    activePets.set(petId, {
      petId,
      petNome: row.pet_nome || "",
      clienteId: Number(row.cliente_id),
      clienteNome: row.cliente_nome || "",
      ultimaCompetencia: row.competencia || "",
      cicloInicio: cycle.inicio,
      cicloFim: cycle.fim,
      totalMeses: 1,
    });
  }

  return Array.from(activePets.values());
}
async function getMonthlyPresence(req, { petId, clienteId = null, competencia }) {
  await ensurePresenceTable(req);
  const db = dbFor(req);
  const petsTable = await resolveTableName(req, TABLE_NAMES.pets);
  const clientesTable = await resolveTableName(req, TABLE_NAMES.clientes);
  const solicitacoesTable = await resolveTableName(req, TABLE_NAMES.hospedagemSolicitacoes);
  const itensTable = await resolveTableName(req, TABLE_NAMES.hospedagemSolicitacaoItens);
  if (!petsTable || !clientesTable || !solicitacoesTable || !itensTable) return null;

  const params = [petId, competencia];
  const ownership = clienteId ? " AND p2.cliente_id = ?" : "";
  if (clienteId) params.push(clienteId);

  const [monthRows] = await db.query(
    `
      SELECT
        m.id AS mensalidade_id,
        m.competencia,
        m.status AS mensalidade_status,
        s.id AS solicitacao_id,
        s.tipo AS solicitacao_tipo,
        s.dias AS solicitacao_dias,
        DATE(s.criado_em) AS solicitacao_data_pedido,
        i.tipo AS item_tipo,
        i.plano_id,
        i.tempo_quantidade,
        i.tempo_unidade,
        i.valor_total AS item_valor_total,
        m.valor AS mensalidade_valor,
        p2.id AS pet_id,
        p2.nome AS pet_nome,
        p2.cliente_id,
        c.nome AS cliente_nome
      FROM ${qtable(TABLE_NAMES.hospedagemMensalidades)} m
      INNER JOIN ${qtable(TABLE_NAMES.hospedagemPagamentos)} pg ON pg.id = m.pagamento_id
      INNER JOIN ${qtable(solicitacoesTable)} s ON s.id = m.solicitacao_id
      INNER JOIN ${qtable(itensTable)} i ON i.solicitacao_id = s.id
      INNER JOIN ${qtable(petsTable)} p2 ON p2.id = i.pet_id
      INNER JOIN ${qtable(clientesTable)} c ON c.id = p2.cliente_id
      WHERE p2.id = ?
        AND m.competencia = ?
        ${ownership}
        AND LOWER(s.status) = 'confirmado'
        AND LOWER(COALESCE(s.tipo, i.tipo, '')) LIKE '%creche%'
        AND LOWER(COALESCE(s.modo_cobranca, i.modo_cobranca, '')) = 'mensal'
        AND LOWER(m.status) IN ('confirmado', 'cancelamento_solicitado')
        AND LOWER(pg.status) = 'confirmado'
      ORDER BY m.id DESC
      LIMIT 1
    `,
    params,
  );

  const month = monthRows?.[0];
  if (!month) return null;
  const cycle = getPresenceCycle(month.solicitacao_data_pedido, month.competencia);
  if (!cycle) return null;

  const [presenceRows] = await db.query(
    `
      SELECT id, data_presenca, registrado_por, criado_em
      FROM ${qtable(TABLE_NAMES.petPresencas)}
      WHERE pet_id = ?
        AND solicitacao_id = ?
        AND data_presenca BETWEEN ? AND ?
      ORDER BY data_presenca ASC
    `,
    [petId, Number(month.solicitacao_id), cycle.inicio, cycle.fim],
  );

  const presencas = (presenceRows || []).map((row) => ({
    id: Number(row.id),
    dataPresenca: clean(row.data_presenca).slice(0, 10),
    registradoPor: row.registrado_por || "",
    criadoEm: row.criado_em || null,
  }));
  const diasUsados = presencas.length;
  const billing = await getCrechePresenceBilling(req, { ...month, cicloInicio: cycle.inicio, cicloFim: cycle.fim }, diasUsados);

  return {
    petId: Number(month.pet_id),
    petNome: month.pet_nome || "",
    clienteId: Number(month.cliente_id),
    clienteNome: month.cliente_nome || "",
    solicitacaoId: Number(month.solicitacao_id),
    mensalidadeId: Number(month.mensalidade_id),
    competencia: month.competencia,
    cicloInicio: cycle.inicio,
    cicloFim: cycle.fim,
    status: month.mensalidade_status || "",
    tipo: month.solicitacao_tipo || "",
    diasContratados: billing.diasContratados,
    diasUsados: billing.diasUsados,
    diasRestantes: billing.diasRestantes,
    diasExcedentes: billing.diasExcedentes,
    limiteDias: billing.limiteDias,
    limiteAtingido: billing.limiteAtingido,
    faixaBase: billing.faixaBase || null,
    valorBase: billing.valorBase,
    valorExcedente: billing.valorExcedente,
    valorTotalComExcedente: billing.valorTotalComExcedente,
    faixasExcedentes: billing.faixasExcedentes,
    presencas,
  };
}

router.get("/presencas/pets", async (req, res) => {
  try {
    const clienteId = await getCurrentClienteId(req);
    if (!clienteId) return res.status(400).json({ status: "erro", mensagem: "Cliente nao identificado." });
    const pets = await listPresencePets(req, { clienteId });
    return res.json({ status: "sucesso", pets });
  } catch (error) {
    console.error("Error in GET /melpethostel/presencas/pets:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.get("/presencas/admin/pets", async (req, res) => {
  try {
    if (!(await requirePresenceAdmin(req, res))) return;
    const pets = await listPresencePets(req);
    return res.json({ status: "sucesso", pets });
  } catch (error) {
    console.error("Error in GET /melpethostel/presencas/admin/pets:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.get("/presencas/pets/:petId", async (req, res) => {
  try {
    const petId = Number(req.params.petId);
    const competencia = clean(req.query.competencia);
    if (!Number.isInteger(petId) || petId <= 0 || !isValidCompetence(competencia)) {
      return res.status(400).json({ status: "erro", mensagem: "Pet ou mes invalido." });
    }
    const clienteId = (await isAdminUser(req, getReqLogin(req))) ? null : await getCurrentClienteId(req);
    if (clienteId === null && !(await isAdminUser(req, getReqLogin(req)))) {
      return res.status(400).json({ status: "erro", mensagem: "Cliente nao identificado." });
    }
    const resumo = await getMonthlyPresence(req, { petId, clienteId, competencia });
    if (!resumo) return res.status(404).json({ status: "erro", mensagem: "Mensalidade valida nao encontrada para este pet e mes." });
    return res.json({ status: "sucesso", resumo });
  } catch (error) {
    console.error("Error in GET /melpethostel/presencas/pets/:petId:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post("/presencas/pets/:petId/toggle", async (req, res) => {
  try {
    if (!(await requirePresenceAdmin(req, res))) return;
    const petId = Number(req.params.petId);
    const dataPresenca = clean(req.body?.dataPresenca || req.body?.data_presenca);
    const competencia = clean(req.body?.competencia || getCompetenceFromDate(dataPresenca));
    if (!Number.isInteger(petId) || petId <= 0 || !isValidDate(dataPresenca) || !isValidCompetence(competencia)) {
      return res.status(400).json({ status: "erro", mensagem: "Pet, mes ou data invalida." });
    }
    const resumo = await getMonthlyPresence(req, { petId, competencia });
    if (!resumo) return res.status(404).json({ status: "erro", mensagem: "Mensalidade valida nao encontrada para este ciclo." });
    if (!isDateInPresenceCycle(dataPresenca, { inicio: resumo.cicloInicio, fim: resumo.cicloFim })) {
      return res.status(400).json({ status: "erro", mensagem: "A data selecionada nao pertence ao ciclo contratado." });
    }

    const db = dbFor(req);
    const [existingRows] = await db.query(
      `SELECT id FROM ${qtable(TABLE_NAMES.petPresencas)} WHERE pet_id = ? AND competencia = ? AND data_presenca = ? LIMIT 1`,
      [petId, competencia, dataPresenca],
    );
    const existing = existingRows?.[0];
    let presente;
    if (existing) {
      await db.query(`DELETE FROM ${qtable(TABLE_NAMES.petPresencas)} WHERE id = ?`, [existing.id]);
      presente = false;
    } else {
      if (resumo.limiteDias > 0 && resumo.diasUsados >= resumo.limiteDias) {
        return res.status(409).json({ status: "erro", mensagem: "Limite de dias do mes atingido." });
      }
      await db.query(
        `INSERT INTO ${qtable(TABLE_NAMES.petPresencas)} (pet_id, cliente_id, solicitacao_id, mensalidade_id, competencia, data_presenca, registrado_por) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [petId, resumo.clienteId, resumo.solicitacaoId, resumo.mensalidadeId, competencia, dataPresenca, getReqLogin(req)],
      );
      presente = true;
    }

    const atualizado = await getMonthlyPresence(req, { petId, competencia });
    return res.json({ status: "sucesso", presente, resumo: atualizado });
  } catch (error) {
    console.error("Error in POST /melpethostel/presencas/pets/:petId/toggle:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

module.exports = router;
module.exports.getMonthlyPresence = getMonthlyPresence;