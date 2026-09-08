const crypto = require("crypto");
const express = require("express");
const router = express.Router();
const {
  MODULE,
  sendTelegramToConfiguredAdmins,
} = require("../../utils/moduleAccessNotification");
const { sendEmail } = require("../../services/emailService");
const {
  TABLE_NAMES,
  dbFor,
  ensureUserDocumentStorage,
  fs,
  getCurrentClienteId,
  getReqLogin,
  getUsuarioByLogin,
  isAdminUser,
  path,
  qcol,
  qtable,
  resolveTableName,
  resolveUploadsDirToDisk,
  resolveUploadsFileToDisk,
  toPublicUploadPath,
  uploadContrato,
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

function normalizePixText(value, maxLength) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .\-]/g, "")
    .slice(0, maxLength);
}

function emvField(id, value) {
  const text = String(value || "");
  return id + String(text.length).padStart(2, "0") + text;
}

function crc16(payload) {
  let crc = 0xffff;
  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function buildPixPayload({ key, name, city, amount, description }) {
  const pixKey = clean(key);
  if (!pixKey) return "";
  const merchantName = normalizePixText(name || "MEL PET HOSTEL", 25);
  const merchantCity = normalizePixText(city || "SAO PAULO", 15);
  const txid =
    normalizePixText(description || crypto.randomUUID(), 25) || "MELPETHOSTEL";
  const merchantAccount =
    emvField("00", "br.gov.bcb.pix") + emvField("01", pixKey);
  const payload =
    emvField("00", "01") +
    emvField("26", merchantAccount) +
    emvField("52", "0000") +
    emvField("53", "986") +
    emvField("54", Number(amount || 0).toFixed(2)) +
    emvField("58", "BR") +
    emvField("59", merchantName) +
    emvField("60", merchantCity) +
    emvField("62", emvField("05", txid));
  const crcPayload = payload + "6304";
  return crcPayload + crc16(crcPayload);
}

function buildPixQrCodeUrl(payload) {
  if (!payload) return "";
  return (
    "https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&data=" +
    encodeURIComponent(payload)
  );
}

async function ensurePixConfigTable(req) {
  await dbFor(req).query(
    "CREATE TABLE IF NOT EXISTS " +
      qtable(TABLE_NAMES.pixConfig) +
      " (" +
      "id INT NOT NULL AUTO_INCREMENT," +
      "chave_pix VARCHAR(255) NOT NULL," +
      'nome_recebedor VARCHAR(120) NOT NULL DEFAULT "MEL PET HOSTEL",' +
      'cidade_recebedor VARCHAR(80) NOT NULL DEFAULT "SAO PAULO",' +
      "ativo TINYINT(1) NOT NULL DEFAULT 1," +
      "atualizado_por VARCHAR(191) NULL DEFAULT NULL," +
      "criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "PRIMARY KEY (id)," +
      "INDEX idx_melpet_pix_ativo (ativo)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  );
}

async function getActivePixConfig(req) {
  await ensurePixConfigTable(req);
  const [rows] = await dbFor(req).query(
    "SELECT id, chave_pix AS chavePix, nome_recebedor AS nomeRecebedor, cidade_recebedor AS cidadeRecebedor, ativo FROM " +
      qtable(TABLE_NAMES.pixConfig) +
      " WHERE id = 1 AND ativo = 1 AND chave_pix IS NOT NULL AND TRIM(chave_pix) <> '' LIMIT 1",
  );
  return rows && rows[0] ? rows[0] : null;
}

async function ensureHostingMonthlyPaymentsTable(req) {
  await ensureHostingPaymentsTable(req);
  const db = dbFor(req);
  await db.query(
    "CREATE TABLE IF NOT EXISTS " +
      qtable(TABLE_NAMES.hospedagemMensalidades) +
      " (" +
      "id INT NOT NULL AUTO_INCREMENT," +
      "solicitacao_id INT NOT NULL," +
      "cliente_id INT NOT NULL," +
      "competencia CHAR(7) NOT NULL," +
      "pagamento_id INT NULL DEFAULT NULL," +
      "valor DECIMAL(10,2) NOT NULL DEFAULT 0.00," +
      "status VARCHAR(30) NOT NULL DEFAULT 'aguardando_pagamento'," +
      "solicitado_cancelamento_em DATETIME NULL DEFAULT NULL," +
      "criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "PRIMARY KEY (id)," +
      "UNIQUE KEY uk_hosp_mensal_competencia (solicitacao_id, competencia)," +
      "INDEX idx_hosp_mensal_cliente (cliente_id)," +
      "INDEX idx_hosp_mensal_status (status)," +
      "INDEX idx_hosp_mensal_pagamento (pagamento_id)," +
      "CONSTRAINT fk_hosp_mensal_solic FOREIGN KEY (solicitacao_id) REFERENCES Hospedagem_Solicitacoes (id) ON DELETE CASCADE," +
      "CONSTRAINT fk_hosp_mensal_pag FOREIGN KEY (pagamento_id) REFERENCES Hospedagem_Pagamentos (id) ON DELETE SET NULL" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  );
}

function getMonthlyCompetence(request) {
  const raw = clean(request?.inicioMes || request?.itens?.[0]?.inicioMes);
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}`;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function getCurrentMonthlyCompetence() {
  const now = new Date();
  const saoPauloDate = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
  );
  return `${saoPauloDate.getFullYear()}-${String(
    saoPauloDate.getMonth() + 1,
  ).padStart(2, "0")}`;
}

function getActiveMonthlyCompetence(request) {
  const currentCompetence = getCurrentMonthlyCompetence();
  const startCompetence = getMonthlyCompetence(request);
  return startCompetence && startCompetence > currentCompetence
    ? startCompetence
    : currentCompetence;
}

function getCurrentMonthEndDate() {
  const now = new Date();
  const saoPauloDate = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
  );
  return new Date(
    saoPauloDate.getFullYear(),
    saoPauloDate.getMonth() + 1,
    0,
    23,
    59,
    59,
  );
}

function isCurrentMonthEnd() {
  const now = new Date();
  const saoPauloDate = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
  );
  return saoPauloDate.getDate() === getCurrentMonthEndDate().getDate();
}

function formatShortDate(value) {
  return value.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}
function getHostingPaymentsFromRequest(request) {
  if (Array.isArray(request?.pagamentos)) return request.pagamentos;
  return request?.pagamento ? [request.pagamento] : [];
}

function getMonthlyPaymentType(competencia) {
  return "mensal_" + clean(competencia).replace("-", "_");
}

function getPaymentCompetence(payment) {
  const explicitCompetence = clean(payment?.mensalidadeCompetencia);
  if (/^\d{4}-\d{2}$/.test(explicitCompetence)) return explicitCompetence;
  const match = clean(payment?.parcelaTipo).match(/^mensal_(\d{4})_(\d{2})$/);
  return match ? `${match[1]}-${match[2]}` : "";
}

function hasConfirmedMonthlyPaymentAtOrAfter(request, competencia) {
  return (request?.pagamentos || []).some((payment) => {
    if (clean(payment?.status).toLowerCase() !== "confirmado") return false;
    const paymentCompetence = getPaymentCompetence(payment);
    return paymentCompetence && paymentCompetence >= competencia;
  });
}

async function ensureCurrentMonthlyPayment(req, request) {
  if (!request || !isMonthlyHostingRequest(request)) return false;
  if (normalizeHostingStatus(request.status) !== "confirmado") return false;
  await ensureHostingMonthlyPaymentsTable(req);
  const competencia = getCurrentMonthlyCompetence();
  if (hasConfirmedMonthlyPaymentAtOrAfter(request, competencia)) return false;
  const parcelaTipo = getMonthlyPaymentType(competencia);
  const existing = (request.pagamentos || []).some(
    (payment) => clean(payment.parcelaTipo) === parcelaTipo,
  );
  if (existing) return false;
  const pixConfig = await getActivePixConfig(req);
  if (!pixConfig?.chavePix) return false;
  const valor = Number(request.valorFinal ?? request.valorTotal ?? 0);
  const pixCopiaCola = buildPixPayload({
    key: pixConfig.chavePix,
    name: pixConfig.nomeRecebedor,
    city: pixConfig.cidadeRecebedor,
    amount: valor,
    description: "HOSPMENSAL" + request.id + competencia.replace("-", ""),
  });
  await dbFor(req).query(
    "INSERT INTO " +
      qtable(TABLE_NAMES.hospedagemPagamentos) +
      " (solicitacao_id, cliente_id, parcela_tipo, valor, pix_copia_cola, qr_code_url, status) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor), pix_copia_cola = VALUES(pix_copia_cola), qr_code_url = VALUES(qr_code_url), atualizado_em = CURRENT_TIMESTAMP",
    [
      request.id,
      request.clienteId,
      parcelaTipo,
      valor,
      pixCopiaCola,
      buildPixQrCodeUrl(pixCopiaCola),
      "aguardando_comprovante",
    ],
  );
  const [paymentRows] = await dbFor(req).query(
    "SELECT id FROM " +
      qtable(TABLE_NAMES.hospedagemPagamentos) +
      " WHERE solicitacao_id = ? AND parcela_tipo = ? LIMIT 1",
    [request.id, parcelaTipo],
  );
  await dbFor(req).query(
    "INSERT INTO " +
      qtable(TABLE_NAMES.hospedagemMensalidades) +
      " (solicitacao_id, cliente_id, competencia, pagamento_id, valor, status) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE pagamento_id = VALUES(pagamento_id), valor = VALUES(valor), status = VALUES(status), atualizado_em = CURRENT_TIMESTAMP",
    [
      request.id,
      request.clienteId,
      competencia,
      paymentRows?.[0]?.id || null,
      valor,
      "aguardando_comprovante",
    ],
  );
  return true;
}

async function ensureCurrentMonthlyPaymentsForRequests(req, requests) {
  const items = Array.isArray(requests) ? requests : [];
  let changed = false;
  for (const request of items) {
    changed = (await ensureCurrentMonthlyPayment(req, request)) || changed;
  }
  return changed;
}
async function ensureHostingPaymentsTable(req) {
  const db = dbFor(req);
  await db.query(
    "CREATE TABLE IF NOT EXISTS " +
      qtable(TABLE_NAMES.hospedagemPagamentos) +
      " (" +
      "id INT NOT NULL AUTO_INCREMENT," +
      "solicitacao_id INT NOT NULL," +
      "cliente_id INT NOT NULL," +
      "parcela_tipo VARCHAR(30) NOT NULL DEFAULT 'total'," +
      "valor DECIMAL(10,2) NOT NULL DEFAULT 0.00," +
      "pix_copia_cola TEXT NULL," +
      "qr_code_url TEXT NULL," +
      "link_pagamento TEXT NULL," +
      "link_pagamento_enviado_em DATETIME NULL DEFAULT NULL," +
      "comprovante_path VARCHAR(500) NULL DEFAULT NULL," +
      "comprovante_nome VARCHAR(255) NULL DEFAULT NULL," +
      "status VARCHAR(30) NOT NULL DEFAULT 'aguardando_comprovante'," +
      "motivo_recusa TEXT NULL," +
      "enviado_em DATETIME NULL DEFAULT NULL," +
      "conferido_por VARCHAR(191) NULL DEFAULT NULL," +
      "conferido_em DATETIME NULL DEFAULT NULL," +
      "criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "PRIMARY KEY (id)," +
      "UNIQUE KEY uk_hosp_pag_solic_parcela (solicitacao_id, parcela_tipo)," +
      "INDEX idx_hosp_pag_cliente (cliente_id)," +
      "INDEX idx_hosp_pag_status (status)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  );
  const [columns] = await db.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'parcela_tipo'",
    [TABLE_NAMES.hospedagemPagamentos],
  );
  if (!columns?.length) {
    await db.query(
      "ALTER TABLE " +
        qtable(TABLE_NAMES.hospedagemPagamentos) +
        " ADD COLUMN parcela_tipo VARCHAR(30) NOT NULL DEFAULT 'total' AFTER cliente_id",
    );
  }
  const [oldForeignKeys] = await db.query(
    "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'fk_hosp_pag_solic' AND CONSTRAINT_TYPE = 'FOREIGN KEY' LIMIT 1",
    [TABLE_NAMES.hospedagemPagamentos],
  );
  if (oldForeignKeys?.length) {
    await db.query(
      "ALTER TABLE " +
        qtable(TABLE_NAMES.hospedagemPagamentos) +
        " DROP FOREIGN KEY fk_hosp_pag_solic",
    );
  }
  const [oldIndexes] = await db.query(
    "SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = 'uk_hosp_pag_solicitacao' LIMIT 1",
    [TABLE_NAMES.hospedagemPagamentos],
  );
  if (oldIndexes?.length) {
    await db.query(
      "ALTER TABLE " +
        qtable(TABLE_NAMES.hospedagemPagamentos) +
        " DROP INDEX uk_hosp_pag_solicitacao",
    );
  }
  const paymentExtraColumns = [
    {
      name: "link_pagamento",
      sql: "ADD COLUMN link_pagamento TEXT NULL AFTER qr_code_url",
    },
    {
      name: "link_pagamento_enviado_em",
      sql: "ADD COLUMN link_pagamento_enviado_em DATETIME NULL DEFAULT NULL AFTER link_pagamento",
    },
  ];
  for (const column of paymentExtraColumns) {
    const [existing] = await db.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
      [TABLE_NAMES.hospedagemPagamentos, column.name],
    );
    if (!existing?.length) {
      await db.query(
        "ALTER TABLE " +
          qtable(TABLE_NAMES.hospedagemPagamentos) +
          " " +
          column.sql,
      );
    }
  }
  const [motivoColumns] = await db.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'motivo_recusa'",
    [TABLE_NAMES.hospedagemPagamentos],
  );
  if (!motivoColumns?.length) {
    await db.query(
      "ALTER TABLE " +
        qtable(TABLE_NAMES.hospedagemPagamentos) +
        " ADD COLUMN motivo_recusa TEXT NULL AFTER status",
    );
  }
  const [newIndexes] = await db.query(
    "SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = 'uk_hosp_pag_solic_parcela' LIMIT 1",
    [TABLE_NAMES.hospedagemPagamentos],
  );
  if (!newIndexes?.length) {
    await db.query(
      "ALTER TABLE " +
        qtable(TABLE_NAMES.hospedagemPagamentos) +
        " ADD UNIQUE KEY uk_hosp_pag_solic_parcela (solicitacao_id, parcela_tipo)",
    );
  }
  const [newForeignKeys] = await db.query(
    "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'fk_hosp_pag_solic' AND CONSTRAINT_TYPE = 'FOREIGN KEY' LIMIT 1",
    [TABLE_NAMES.hospedagemPagamentos],
  );
  if (!newForeignKeys?.length) {
    await db.query(
      "ALTER TABLE " +
        qtable(TABLE_NAMES.hospedagemPagamentos) +
        " ADD CONSTRAINT fk_hosp_pag_solic FOREIGN KEY (solicitacao_id) REFERENCES Hospedagem_Solicitacoes (id) ON DELETE CASCADE",
    );
  }
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
  if (!value) return "";
  if (value instanceof Date) {
    return value.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  }

  const text = clean(value);
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1].slice(-2)}`;

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  }

  return text;
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
      `Tipo: <b>${clean(item.tipo) || "-"} / ${clean(item.quantidadeSolicitada || item.tempoQuantidade) || "1"} ${clean(item.tempoUnidade) || "dia"} -> ${formatTelegramMoney(item.valorDiaria)}</b>`,
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
  await ensureHostingMonthlyPaymentsTable(req);

  const [rows] = await db.query(
    `
      SELECT
        s.id AS solicitacao_id,
        s.cliente_id AS solicitacao_cliente_id,
        c.nome AS cliente_nome,
        c.email AS cliente_email,
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
        p.id AS pagamento_id,
        p.parcela_tipo AS pagamento_parcela_tipo,
        p.valor AS pagamento_valor,
        p.pix_copia_cola AS pagamento_pix_copia_cola,
        p.qr_code_url AS pagamento_qr_code_url,
        p.link_pagamento AS pagamento_link_pagamento,
        p.link_pagamento_enviado_em AS pagamento_link_pagamento_enviado_em,
        p.comprovante_path AS pagamento_comprovante_path,
        p.comprovante_nome AS pagamento_comprovante_nome,
        p.status AS pagamento_status,
        p.motivo_recusa AS pagamento_motivo_recusa,
        p.enviado_em AS pagamento_enviado_em,
        p.conferido_por AS pagamento_conferido_por,
        p.conferido_em AS pagamento_conferido_em,
        m.competencia AS mensalidade_competencia,
        m.status AS mensalidade_status,
        m.solicitado_cancelamento_em AS mensalidade_cancelamento_solicitado_em,
        i.id AS item_id,
        i.pet_id AS item_pet_id,
        COALESCE(i.pet_nome, pet.nome) AS item_pet_nome,
        ficha.sexo AS item_pet_sexo,
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
      LEFT JOIN Pets pet ON pet.id = i.pet_id
      LEFT JOIN Pet_Fichas ficha ON ficha.pet_id = i.pet_id
      LEFT JOIN ${qtable(TABLE_NAMES.hospedagemPagamentos)} p ON p.solicitacao_id = s.id
      LEFT JOIN ${qtable(TABLE_NAMES.hospedagemMensalidades)} m ON m.pagamento_id = p.id
      LEFT JOIN Clientes c ON c.id = s.cliente_id
      LEFT JOIN Usuarios u ON u.cliente_id = s.cliente_id
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
        clienteId: row.solicitacao_cliente_id,
        clienteNome: row.cliente_nome,
        clienteEmail: row.cliente_email || "",
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
        pagamento: row.pagamento_id
          ? {
              id: Number(row.pagamento_id),
              valor: row.pagamento_valor,
              pixCopiaCola: row.pagamento_pix_copia_cola || "",
              qrCodeUrl: row.pagamento_qr_code_url || "",
              linkPagamento: row.pagamento_link_pagamento || "",
              linkPagamentoEnviadoEm:
                row.pagamento_link_pagamento_enviado_em || null,
              comprovantePath: row.pagamento_comprovante_path || "",
              comprovanteUrl: row.pagamento_comprovante_path
                ? toPublicUploadPath(row.pagamento_comprovante_path)
                : "",
              comprovanteNome: row.pagamento_comprovante_nome || "",
              status: row.pagamento_status || "",
              enviadoEm: row.pagamento_enviado_em || null,
            }
          : null,
        itens: [],
      });
    }

    if (row.item_id !== null && row.item_id !== undefined) {
      const solicitacao = solicitacoesById.get(id);
      const itemId = Number(row.item_id);
      if (solicitacao.itens.some((item) => item.id === itemId)) continue;
      solicitacao.itens.push({
        id: itemId,
        petId: row.item_pet_id,
        petNome: row.item_pet_nome,
        sexo: row.item_pet_sexo || "",
        tipo: row.item_tipo,
        planoId: row.item_plano_id,
        modoCobranca: row.item_modo_cobranca,
        tempoQuantidade: row.item_tempo_quantidade,
        quantidadeSolicitada: row.item_tempo_quantidade || 1,
        tempoUnidade: row.item_tempo_unidade || "dia",
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

function formatPaymentTypeLabel(value) {
  const type = clean(value).toLowerCase();
  if (type === "reserva") return "Reserva";
  if (type === "checkin") return "Check-in";
  return "Pagamento Total";
}

function buildHostingReceiptTelegramMessage({
  login,
  request,
  parcelaTipo,
  valor,
}) {
  const items = request?.itens?.length ? request.itens : [{}];
  const itemBlocks = items.map((item) => [
    `Pet: <b>${clean(item.petNome) || (item.petId ? `Pet ${item.petId}` : "-")}</b>`,
    `Serviço: <b>${clean(request?.tipo) || "-"}</b>`,
    `Tipo: <b>${clean(item.tipo) || "-"}</b>`,
    `Entrada: <b>${formatTelegramDate(item.dataEntrada || request?.dataEntrada)}</b>`,
    `Saída: <b>${formatTelegramDate(item.dataSaida || request?.dataSaida)}</b>`,
    `Dias: <b>${clean(item.dias || request?.dias) || "-"}</b>`,
  ]);

  return [
    "Novo Comprovante enviado",
    `Tutor: <b>${clean(login)}</b>`,
    ...itemBlocks.flat(),
    `Tipo de Pagamento: <b>${formatPaymentTypeLabel(parcelaTipo)}</b>`,
    `Valor do Comprovante: <b>${formatTelegramMoney(valor)}</b>`,
  ].join("\n");
}

async function notifyHostingReceiptAdmins(
  req,
  { login, request, parcelaTipo, valor },
) {
  return sendTelegramToConfiguredAdmins({
    db: dbFor(req),
    module: MODULE,
    message: buildHostingReceiptTelegramMessage({
      login,
      request,
      parcelaTipo,
      valor,
    }),
    disabledReason: "notificacao_desativada",
  });
}

function buildHostingPaymentLinkTelegramMessage({ login, request }) {
  return (
    buildHostingTelegramMessage({
      header: "=== ENVIAR LINK DE PAGAMENTO ===",
      login,
      tipo: request?.tipo,
      items: request?.itens || [],
      totalFormatado: formatTelegramMoney(
        request?.valorFinal ?? request?.valorTotal,
      ),
    }) + "\nGere o link de pagamento e inclua no sistema da Mel Pet Hostel."
  );
}

async function notifyHostingPaymentLinkAdmins(req, { login, request }) {
  return sendTelegramToConfiguredAdmins({
    db: dbFor(req),
    module: MODULE,
    message: buildHostingPaymentLinkTelegramMessage({ login, request }),
    disabledReason: "notificacao_desativada",
  });
}

function getPetGenderArticle(request) {
  const pet = (request?.itens || [])[0] || {};
  const text = clean(pet.sexo || pet.genero || pet.gender)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return text.startsWith("f") ? "da pequena" : "do pequeno";
}

async function sendHostingPaymentLinkEmail(request, linkPagamento) {
  const petNome = clean((request?.itens || [])[0]?.petNome) || "pet";
  const result = await sendEmail({
    to: request?.clienteEmail,
    subject: "Link de Pagamento - Mel Pet Hostel",
    text: `Ola ${request?.clienteNome || "Tutor"},
Para a estadia ${getPetGenderArticle(request)} ${petNome}, o modo de pagamento selecionado foi via cartao de credito.
Geramos o Link de Pagamnto abaixo:
${linkPagamento}

Para pagamentos realizados por cartão de crédito, juros, encargos e taxas administrativas de eventuais parcelamentos, serão de responsabilidade do cliente.


Caso queira, você também pode acessar o sistema da Mel Pet Hostel para confirmar o link de pagamento ou mudar a opção de pagamento.
Obrigado por escolher os serviço da Mel Pet Hostel.`,
  });
  if (!result.sent)
    console.warn("Hosting payment link email not sent:", result.reason);
  return result;
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
  if (["recusado", "recusada", "reprovado", "reprovada"].includes(normalized))
    return "recusado";
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

function formatEmailDate(value) {
  if (!value) return "data nao informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return clean(value) || "data nao informada";
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

async function sendHostingApprovalEmail(request) {
  const result = await sendEmail({
    to: request?.clienteEmail,
    subject: "Confirmação do seu Pedido de Hospedagem - Mel Pet Hostel",
    text: `Ola ${request?.clienteNome || "Tutor"},
O seu pedido de ${request?.tipo || "hospedagem"} para ${formatEmailDate(request?.dataEntrada)} até ${formatEmailDate(request?.dataSaida)} foi analisado e aprovado.
Para confirmar a sua reserva, acesse o sistema da Mel Pet Hostel, efetue o processo de pagamento e nos envie o comprovante.
Lembrando que a estadia só será liberada após a comprovação dos pagamentos.
Muito obrigado por escolher a Mel pet Hostel.`,
  });

  if (!result.sent) {
    console.warn("Hosting approval email not sent:", result.reason);
  }
  return result;
}
function isMonthlyHostingRequest(request) {
  if (normalizeBillingMode(request?.modoCobranca) === "mensal") return true;
  return (request?.itens || []).some(
    (item) => normalizeBillingMode(item?.modoCobranca) === "mensal",
  );
}

function getAllowedHostingStatusTransition(status) {
  const normalized = normalizeHostingStatus(status);
  if (
    normalized === "pendente" ||
    normalized === "aprovado" ||
    normalized === "aguardando_pagamento"
  ) {
    return "cancelado";
  }
  return "";
}

async function requireHostingAdmin(req, res) {
  const login = getReqLogin(req);
  if (!(await isAdminUser(req, login))) {
    res.status(403).json({
      status: "erro",
      mensagem: "Apenas administradores podem executar esta acao.",
    });
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
        clienteEmail: row.cliente_email || "",
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
        pagamento: null,
        pagamentos: [],
        itens: [],
      });
    }

    const solicitacao = solicitacoesById.get(solicitacaoId);
    if (row.pagamento_id !== null && row.pagamento_id !== undefined) {
      const pagamentoId = Number(row.pagamento_id);
      if (!solicitacao.pagamentos.some((item) => item.id === pagamentoId)) {
        const pagamento = {
          id: pagamentoId,
          parcelaTipo: row.pagamento_parcela_tipo || "total",
          valor: row.pagamento_valor,
          pixCopiaCola: row.pagamento_pix_copia_cola || "",
          qrCodeUrl: row.pagamento_qr_code_url || "",
          linkPagamento: row.pagamento_link_pagamento || "",
          linkPagamentoEnviadoEm:
            row.pagamento_link_pagamento_enviado_em || null,
          comprovantePath: row.pagamento_comprovante_path || "",
          comprovanteUrl: row.pagamento_comprovante_path
            ? toPublicUploadPath(row.pagamento_comprovante_path)
            : "",
          comprovanteNome: row.pagamento_comprovante_nome || "",
          status: row.pagamento_status || "",
          motivoRecusa: row.pagamento_motivo_recusa || "",
          enviadoEm: row.pagamento_enviado_em || null,
          conferidoPor: row.pagamento_conferido_por || "",
          conferidoEm: row.pagamento_conferido_em || null,
          mensalidadeCompetencia: row.mensalidade_competencia || "",
          mensalidadeStatus: row.mensalidade_status || "",
          mensalidadeCancelamentoSolicitadoEm:
            row.mensalidade_cancelamento_solicitado_em || null,
        };
        solicitacao.pagamentos.push(pagamento);
        if (!solicitacao.pagamento) solicitacao.pagamento = pagamento;
      }
    }

    if (row.item_id !== null && row.item_id !== undefined) {
      const itemId = Number(row.item_id);
      if (!solicitacao.itens.some((item) => item.id === itemId)) {
        solicitacao.itens.push({
          id: itemId,
          petId: row.item_pet_id,
          petNome: row.item_pet_nome,
          sexo: row.item_pet_sexo || "",
          tipo: row.item_tipo,
          planoId: row.item_plano_id,
          modoCobranca: row.item_modo_cobranca,
          tempoQuantidade: row.item_tempo_quantidade,
          quantidadeSolicitada: row.item_tempo_quantidade || 1,
          tempoUnidade: row.item_tempo_unidade || "dia",
          inicioMes: row.item_inicio_mes,
          dataEntrada: row.item_data_entrada,
          dataSaida: row.item_data_saida,
          dias: row.item_dias,
          valorDiaria: row.item_valor_diaria,
          valorTotal: row.item_valor_total,
        });
      }
    }
  }
  return Array.from(solicitacoesById.values());
}
async function listHostingRequests(
  req,
  { clienteId = null, status = "", ensureMonthly = true } = {},
) {
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
  await ensureHostingMonthlyPaymentsTable(req);
  const where = [];
  const params = [];
  if (clienteId) {
    where.push("s.cliente_id = ?");
    params.push(clienteId);
  }
  if (status) {
    where.push("LOWER(TRIM(s.status)) = LOWER(TRIM(?))");
    params.push(status);
  }
  const sql = `
      SELECT
        s.id AS solicitacao_id,
        s.cliente_id AS solicitacao_cliente_id,
        c.nome AS cliente_nome,
        c.email AS cliente_email,
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
        p.id AS pagamento_id,
        p.parcela_tipo AS pagamento_parcela_tipo,
        p.valor AS pagamento_valor,
        p.pix_copia_cola AS pagamento_pix_copia_cola,
        p.qr_code_url AS pagamento_qr_code_url,
        p.link_pagamento AS pagamento_link_pagamento,
        p.link_pagamento_enviado_em AS pagamento_link_pagamento_enviado_em,
        p.comprovante_path AS pagamento_comprovante_path,
        p.comprovante_nome AS pagamento_comprovante_nome,
        p.status AS pagamento_status,
        p.motivo_recusa AS pagamento_motivo_recusa,
        p.enviado_em AS pagamento_enviado_em,
        p.conferido_por AS pagamento_conferido_por,
        p.conferido_em AS pagamento_conferido_em,
        m.competencia AS mensalidade_competencia,
        m.status AS mensalidade_status,
        m.solicitado_cancelamento_em AS mensalidade_cancelamento_solicitado_em,
        i.id AS item_id,
        i.pet_id AS item_pet_id,
        COALESCE(i.pet_nome, pet.nome) AS item_pet_nome,
        ficha.sexo AS item_pet_sexo,
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
      LEFT JOIN Pets pet ON pet.id = i.pet_id
      LEFT JOIN Pet_Fichas ficha ON ficha.pet_id = i.pet_id
      LEFT JOIN ${qtable(TABLE_NAMES.hospedagemPagamentos)} p ON p.solicitacao_id = s.id
      LEFT JOIN ${qtable(TABLE_NAMES.hospedagemMensalidades)} m ON m.pagamento_id = p.id
      LEFT JOIN Clientes c ON c.id = s.cliente_id
      LEFT JOIN Usuarios u ON u.cliente_id = s.cliente_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY s.criado_em DESC, i.id ASC
    `;
  const [rows] = await db.query(sql, params);
  const requests = mapHostingRows(rows);
  if (ensureMonthly && isCurrentMonthEnd()) {
    const shouldCancelMonthly = requests.filter(
      (request) =>
        normalizeHostingStatus(request.status) === "confirmado" &&
        isMonthlyHostingRequest(request) &&
        getHostingPaymentsFromRequest(request).some(
          (payment) => payment.mensalidadeStatus === "cancelamento_solicitado",
        ),
    );
    for (const request of shouldCancelMonthly) {
      await db.query(
        "UPDATE " +
          qtable(solicitacoesTable) +
          " SET status = 'cancelado', atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
        [request.id],
      );
    }
    if (shouldCancelMonthly.length) {
      return listHostingRequests(req, { clienteId, status, ensureMonthly: false });
    }
  }
  if (ensureMonthly) {
    const changed = await ensureCurrentMonthlyPaymentsForRequests(req, requests);
    if (changed) {
      return listHostingRequests(req, { clienteId, status, ensureMonthly: false });
    }
  }
  return requests;
}

router.get("/hospedagens/pix-config", async (req, res) => {
  try {
    if (!(await requireHostingAdmin(req, res))) return;
    const config = await getActivePixConfig(req);
    return res.json({
      status: "sucesso",
      config: config
        ? {
            id: config.id,
            chavePix: config.chavePix,
            nomeRecebedor: config.nomeRecebedor,
            cidadeRecebedor: config.cidadeRecebedor,
            ativo: Boolean(config.ativo),
          }
        : null,
    });
  } catch (error) {
    console.error("Error in GET /melpethostel/hospedagens/pix-config:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post("/hospedagens/pix-config", async (req, res) => {
  try {
    if (!(await requireHostingAdmin(req, res))) return;
    const chavePix = clean(req.body?.chavePix || req.body?.chave_pix);
    const nomeRecebedor = clean(
      req.body?.nomeRecebedor || req.body?.nome_recebedor || "MEL PET HOSTEL",
    );
    const cidadeRecebedor = clean(
      req.body?.cidadeRecebedor || req.body?.cidade_recebedor || "SAO PAULO",
    );
    if (!chavePix)
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Informe a chave PIX." });
    await ensurePixConfigTable(req);
    await dbFor(req).query(
      "INSERT INTO " +
        qtable(TABLE_NAMES.pixConfig) +
        " (id, chave_pix, nome_recebedor, cidade_recebedor, ativo, atualizado_por) VALUES (1, ?, ?, ?, 1, ?) ON DUPLICATE KEY UPDATE chave_pix = VALUES(chave_pix), nome_recebedor = VALUES(nome_recebedor), cidade_recebedor = VALUES(cidade_recebedor), ativo = 1, atualizado_por = VALUES(atualizado_por), atualizado_em = CURRENT_TIMESTAMP",
      [chavePix, nomeRecebedor, cidadeRecebedor, getReqLogin(req)],
    );
    const result = { insertId: 1 };
    return res.json({
      status: "sucesso",
      mensagem: "Configuração PIX salva com sucesso.",
      config: {
        id: result.insertId,
        chavePix,
        nomeRecebedor,
        cidadeRecebedor,
        ativo: true,
      },
    });
  } catch (error) {
    console.error("Error in POST /melpethostel/hospedagens/pix-config:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});
router.get("/hospedagens/solicitacoes/pendentes", async (req, res) => {
  try {
    if (!(await requireHostingAdmin(req, res))) return;
    const solicitacoes = await listHostingRequests(req, { status: "pendente" });
    if (!solicitacoes)
      return res.status(500).json({
        status: "erro",
        mensagem:
          "Tabelas de hospedagem nao encontradas. Execute create_hospedagens_schema.sql.",
      });
    return res.json({
      status: "sucesso",
      total: solicitacoes.length,
      solicitacoes,
    });
  } catch (error) {
    console.error(
      "Error in GET /melpethostel/hospedagens/solicitacoes/pendentes:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.patch("/hospedagens/solicitacoes/:id/aprovar", async (req, res) => {
  try {
    if (!(await requireHostingAdmin(req, res))) return;
    const solicitacaoId = Number(req.params?.id);
    if (!Number.isInteger(solicitacaoId) || solicitacaoId <= 0)
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Solicitacao invalida." });
    const table = await resolveTableName(
      req,
      TABLE_NAMES.hospedagemSolicitacoes,
    );
    if (!table)
      return res.status(500).json({
        status: "erro",
        mensagem: "Tabela de hospedagem nao encontrada.",
      });
    const [rows] = await dbFor(req).query(
      `SELECT id, status FROM ${qtable(table)} WHERE id = ? LIMIT 1`,
      [solicitacaoId],
    );
    const solicitacao = rows && rows[0] ? rows[0] : null;
    if (!solicitacao)
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Solicitacao nao encontrada." });
    if (normalizeHostingStatus(solicitacao.status) !== "pendente")
      return res
        .status(409)
        .json({ status: "erro", mensagem: "A solicitacao nao esta pendente." });
    await dbFor(req).query(
      `UPDATE ${qtable(table)} SET status = ?, analisado_por = ?, analisado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`,
      ["aprovado", getReqLogin(req), solicitacaoId],
    );
    const solicitacaoAprovada = (await loadHostingRequestById(
      req,
      solicitacaoId,
    )) || {
      id: solicitacaoId,
      status: "aprovado",
    };
    const emailStatus = await sendHostingApprovalEmail(
      solicitacaoAprovada,
    ).catch((emailError) => {
      console.warn(
        "Error sending hosting approval email:",
        emailError?.message || emailError,
      );
      return {
        sent: false,
        reason: "erro_envio_email",
        message: emailError?.message || String(emailError),
      };
    });
    return res.json({
      status: "sucesso",
      mensagem: "Hospedagem aprovada com sucesso.",
      solicitacao: solicitacaoAprovada,
      email: emailStatus,
    });
  } catch (error) {
    console.error(
      "Error in PATCH /melpethostel/hospedagens/solicitacoes/:id/aprovar:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.patch("/hospedagens/solicitacoes/:id/reprovar", async (req, res) => {
  try {
    if (!(await requireHostingAdmin(req, res))) return;
    const solicitacaoId = Number(req.params?.id);
    const motivoRecusa = clean(
      req.body?.motivoRecusa || req.body?.motivoReprovacao,
    );
    if (!Number.isInteger(solicitacaoId) || solicitacaoId <= 0)
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Solicitacao invalida." });
    if (!motivoRecusa)
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Informe o motivo da reprovacao." });
    const table = await resolveTableName(
      req,
      TABLE_NAMES.hospedagemSolicitacoes,
    );
    if (!table)
      return res.status(500).json({
        status: "erro",
        mensagem: "Tabela de hospedagem nao encontrada.",
      });
    const [rows] = await dbFor(req).query(
      `SELECT id, status FROM ${qtable(table)} WHERE id = ? LIMIT 1`,
      [solicitacaoId],
    );
    const solicitacao = rows && rows[0] ? rows[0] : null;
    if (!solicitacao)
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Solicitacao nao encontrada." });
    if (normalizeHostingStatus(solicitacao.status) !== "pendente")
      return res
        .status(409)
        .json({ status: "erro", mensagem: "A solicitacao nao esta pendente." });
    await dbFor(req).query(
      `UPDATE ${qtable(table)} SET status = ?, motivo_recusa = ?, analisado_por = ?, analisado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`,
      ["recusado", motivoRecusa, getReqLogin(req), solicitacaoId],
    );
    return res.json({
      status: "sucesso",
      mensagem: "Hospedagem reprovada com sucesso.",
      solicitacao: { id: solicitacaoId, status: "recusado", motivoRecusa },
    });
  } catch (error) {
    console.error(
      "Error in PATCH /melpethostel/hospedagens/solicitacoes/:id/reprovar:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});
router.get("/hospedagens/solicitacoes", async (req, res) => {
  try {
    const clienteId = await getCurrentClienteId(req);
    if (!clienteId) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Cliente não identificado para consultar hospedagens.",
      });
    }

    const solicitacoes = await listHostingRequests(req, { clienteId });
    if (!solicitacoes) {
      return res.status(500).json({
        status: "erro",
        mensagem:
          "Tabelas de hospedagem não encontradas. Execute create_hospedagens_schema.sql.",
      });
    }

    return res.json({ status: "sucesso", solicitacoes });
  } catch (error) {
    console.error(
      "Error in GET /melpethostel/hospedagens/solicitacoes:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post(
  "/hospedagens/solicitacoes/:id/pagamento-opcao",
  async (req, res) => {
    try {
      const clienteId = await getCurrentClienteId(req);
      const solicitacaoId = Number(req.params?.id);
      const opcao = clean(req.body?.opcao || req.body?.tipo).toLowerCase();
      if (!clienteId)
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Cliente não identificado." });
      if (!Number.isInteger(solicitacaoId) || solicitacaoId <= 0)
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Solicitação inválida." });
      if (
        !["total", "dividido", "reserva_checkin", "cartao_credito"].includes(
          opcao,
        )
      )
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Opção de pagamento inválida." });
      const table = await resolveTableName(
        req,
        TABLE_NAMES.hospedagemSolicitacoes,
      );
      if (!table)
        return res.status(500).json({
          status: "erro",
          mensagem: "Tabela de hospedagem não encontrada.",
        });
      const [rows] = await dbFor(req).query(
        "SELECT id, cliente_id, valor_total, valor_final, status FROM " +
          qtable(table) +
          " WHERE id = ? AND cliente_id = ? LIMIT 1",
        [solicitacaoId, clienteId],
      );
      const solicitacao = rows && rows[0] ? rows[0] : null;
      if (!solicitacao)
        return res
          .status(404)
          .json({ status: "erro", mensagem: "Solicitação não encontrada." });
      if (normalizeHostingStatus(solicitacao.status) !== "aprovado")
        return res.status(409).json({
          status: "erro",
          mensagem: "O pagamento só pode ser gerado para hospedagem aprovada.",
        });
      const requestForPaymentRule = await loadHostingRequestById(req, solicitacaoId);
      if (["dividido", "reserva_checkin"].includes(opcao) && isMonthlyHostingRequest(requestForPaymentRule)) {
        return res.status(400).json({
          status: "erro",
          mensagem: "Planos mensais permitem apenas pagamento total ou cartao de credito.",
        });
      }
      const isCardPayment = opcao === "cartao_credito";
      const pixConfig = isCardPayment ? null : await getActivePixConfig(req);
      if (!isCardPayment && !pixConfig?.chavePix)
        return res.status(400).json({
          status: "erro",
          mensagem: "PIX ainda não configurado pelo administrador.",
        });
      const isMonthlyPayment = isMonthlyHostingRequest(requestForPaymentRule);
      if (isMonthlyPayment) {
        await ensureHostingMonthlyPaymentsTable(req);
      } else {
        await ensureHostingPaymentsTable(req);
      }
      const valorFinal = Number(
        solicitacao.valor_final ?? solicitacao.valor_total ?? 0,
      );
      const monthlyCompetence = isMonthlyPayment
        ? getMonthlyCompetence(requestForPaymentRule)
        : "";
      const monthlyType = monthlyCompetence
        ? "mensal_" + monthlyCompetence.replace("-", "_")
        : "mensal";
      const parcelas = isMonthlyPayment
        ? [
            {
              tipo: opcao === "cartao_credito" ? "cartao_credito" : monthlyType,
              competencia: monthlyCompetence,
              valor: valorFinal,
            },
          ]
        : opcao === "cartao_credito"
          ? [{ tipo: "cartao_credito", valor: valorFinal }]
          : opcao === "total"
            ? [{ tipo: "total", valor: valorFinal }]
            : [
                {
                  tipo: "reserva",
                  valor: Math.round((valorFinal / 2) * 100) / 100,
                },
                {
                  tipo: "checkin",
                  valor:
                    Math.round(
                      (valorFinal - Math.round((valorFinal / 2) * 100) / 100) *
                        100,
                    ) / 100,
                },
              ];
      await dbFor(req).query(
        "DELETE FROM " +
          qtable(TABLE_NAMES.hospedagemPagamentos) +
          " WHERE solicitacao_id = ? AND cliente_id = ? AND (comprovante_path IS NULL OR comprovante_path = '')",
        [solicitacaoId, clienteId],
      );
      for (const parcela of parcelas) {
        const parcelaIsCard = parcela.tipo === "cartao_credito";
        const pixCopiaCola = parcelaIsCard
          ? ""
          : buildPixPayload({
              key: pixConfig.chavePix,
              name: pixConfig.nomeRecebedor,
              city: pixConfig.cidadeRecebedor,
              amount: parcela.valor,
              description:
                "HOSPED" + solicitacaoId + parcela.tipo.toUpperCase(),
            });
        await dbFor(req).query(
          "INSERT INTO " +
            qtable(TABLE_NAMES.hospedagemPagamentos) +
            " (solicitacao_id, cliente_id, parcela_tipo, valor, pix_copia_cola, qr_code_url, status) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor), pix_copia_cola = VALUES(pix_copia_cola), qr_code_url = VALUES(qr_code_url), atualizado_em = CURRENT_TIMESTAMP",
          [
            solicitacaoId,
            clienteId,
            parcela.tipo,
            parcela.valor,
            pixCopiaCola,
            parcelaIsCard ? "" : buildPixQrCodeUrl(pixCopiaCola),
            parcelaIsCard ? "aguardando_link" : "aguardando_comprovante",
          ],
        );
        if (parcela.competencia) {
          const [paymentRows] = await dbFor(req).query(
            "SELECT id FROM " +
              qtable(TABLE_NAMES.hospedagemPagamentos) +
              " WHERE solicitacao_id = ? AND parcela_tipo = ? LIMIT 1",
            [solicitacaoId, parcela.tipo],
          );
          await dbFor(req).query(
            "INSERT INTO " +
              qtable(TABLE_NAMES.hospedagemMensalidades) +
              " (solicitacao_id, cliente_id, competencia, pagamento_id, valor, status) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE pagamento_id = VALUES(pagamento_id), valor = VALUES(valor), status = VALUES(status), atualizado_em = CURRENT_TIMESTAMP",
            [
              solicitacaoId,
              clienteId,
              parcela.competencia,
              paymentRows?.[0]?.id || null,
              parcela.valor,
              parcelaIsCard ? "aguardando_link" : "aguardando_comprovante",
            ],
          );
        }
      }
      const requestForNotice = await loadHostingRequestById(req, solicitacaoId);
      if (isCardPayment && requestForNotice) {
        await notifyHostingPaymentLinkAdmins(req, {
          login: requestForNotice.usuarioLogin || getReqLogin(req),
          request: requestForNotice,
        }).catch((telegramError) => {
          console.error(
            "Erro notificando link de pagamento no Telegram:",
            telegramError,
          );
        });
      }
      const solicitacoes = await listHostingRequests(req, { clienteId });
      return res.json({
        status: "sucesso",
        mensagem: "Pagamento gerado com sucesso.",
        solicitacao:
          (solicitacoes || []).find(
            (item) => Number(item.id) === solicitacaoId,
          ) || null,
      });
    } catch (error) {
      console.error(
        "Error in POST /melpethostel/hospedagens/solicitacoes/:id/pagamento-opcao:",
        error,
      );
      return res.status(500).json({ status: "erro", mensagem: error.message });
    }
  },
);

router.get("/hospedagens/pagamentos/cartao/pendentes", async (req, res) => {
  try {
    if (!(await requireHostingAdmin(req, res))) return;
    const solicitacoes = await listHostingRequests(req, { status: "aprovado" });
    const pendentes = (solicitacoes || []).filter((solicitacao) =>
      (solicitacao.pagamentos || []).some(
        (payment) =>
          payment.parcelaTipo === "cartao_credito" &&
          !clean(payment.linkPagamento) &&
          !["confirmado", "comprovante_enviado"].includes(
            clean(payment.status).toLowerCase(),
          ),
      ),
    );
    return res.json({
      status: "sucesso",
      total: pendentes.length,
      solicitacoes: pendentes,
    });
  } catch (error) {
    console.error(
      "Error in GET /melpethostel/hospedagens/pagamentos/cartao/pendentes:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.patch("/hospedagens/pagamentos/:id/link-pagamento", async (req, res) => {
  try {
    if (!(await requireHostingAdmin(req, res))) return;
    const pagamentoId = Number(req.params?.id);
    const linkPagamento = clean(
      req.body?.linkPagamento || req.body?.link_pagamento,
    );
    if (!Number.isInteger(pagamentoId) || pagamentoId <= 0)
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Pagamento inválido." });
    if (!/^https?:\/\//i.test(linkPagamento))
      return res.status(400).json({
        status: "erro",
        mensagem: "Informe um link de pagamento válido.",
      });
    await ensureHostingPaymentsTable(req);
    const [rows] = await dbFor(req).query(
      "SELECT id, solicitacao_id, parcela_tipo FROM " +
        qtable(TABLE_NAMES.hospedagemPagamentos) +
        " WHERE id = ? LIMIT 1",
      [pagamentoId],
    );
    const pagamento = rows?.[0];
    if (!pagamento || pagamento.parcela_tipo !== "cartao_credito")
      return res.status(404).json({
        status: "erro",
        mensagem: "Pagamento por cartão não encontrado.",
      });
    await dbFor(req).query(
      "UPDATE " +
        qtable(TABLE_NAMES.hospedagemPagamentos) +
        " SET link_pagamento = ?, link_pagamento_enviado_em = CURRENT_TIMESTAMP, status = 'aguardando_pagamento', atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
      [linkPagamento, pagamentoId],
    );
    const request = await loadHostingRequestById(req, pagamento.solicitacao_id);
    const email = await sendHostingPaymentLinkEmail(
      request,
      linkPagamento,
    ).catch((emailError) => ({
      sent: false,
      reason: "erro_envio_email",
      message: emailError?.message || String(emailError),
    }));
    return res.json({
      status: "sucesso",
      mensagem: "Link de pagamento enviado com sucesso.",
      solicitacao: request,
      email,
    });
  } catch (error) {
    console.error(
      "Error in PATCH /melpethostel/hospedagens/pagamentos/:id/link-pagamento:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.get("/hospedagens/comprovantes/pendentes", async (req, res) => {
  try {
    if (!(await requireHostingAdmin(req, res))) return;
    const solicitacoes = await listHostingRequests(req, {});
    const pendentes = (solicitacoes || []).filter((solicitacao) =>
      (solicitacao.pagamentos || []).some(
        (pagamento) => pagamento.status === "comprovante_enviado",
      ),
    );
    return res.json({
      status: "sucesso",
      total: pendentes.length,
      solicitacoes: pendentes,
    });
  } catch (error) {
    console.error(
      "Error in GET /melpethostel/hospedagens/comprovantes/pendentes:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.get("/hospedagens/checkin/pendentes", async (req, res) => {
  try {
    if (!(await requireHostingAdmin(req, res))) return;
    const solicitacoes = await listHostingRequests(req, { status: "confirmado" });
    if (!solicitacoes)
      return res.status(500).json({
        status: "erro",
        mensagem: "Tabelas de hospedagem nao encontradas.",
      });
    return res.json({ status: "sucesso", solicitacoes });
  } catch (error) {
    console.error(
      "Error in GET /melpethostel/hospedagens/checkin/pendentes:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.patch("/hospedagens/solicitacoes/:id/checkin", async (req, res) => {
  try {
    if (!(await requireHostingAdmin(req, res))) return;
    const solicitacaoId = Number(req.params?.id);
    if (!Number.isInteger(solicitacaoId) || solicitacaoId <= 0)
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Solicitacao invalida." });

    const table = await resolveTableName(
      req,
      TABLE_NAMES.hospedagemSolicitacoes,
    );
    if (!table)
      return res.status(500).json({
        status: "erro",
        mensagem: "Tabela de hospedagens nao encontrada.",
      });

    const [rows] = await dbFor(req).query(
      "SELECT id, status FROM " + qtable(table) + " WHERE id = ? LIMIT 1",
      [solicitacaoId],
    );
    const solicitacao = rows && rows[0] ? rows[0] : null;
    if (!solicitacao)
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Solicitacao nao encontrada." });
    if (normalizeHostingStatus(solicitacao.status) !== "confirmado")
      return res.status(409).json({
        status: "erro",
        mensagem:
          "O check-in so pode ser confirmado em hospedagens com pagamento confirmado.",
      });

    await dbFor(req).query(
      "UPDATE " + qtable(table) + " SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
      ["concluido", solicitacaoId],
    );

    return res.json({
      status: "sucesso",
      mensagem: "Check-in confirmado com sucesso.",
      solicitacao: { id: solicitacaoId, status: "concluido" },
    });
  } catch (error) {
    console.error(
      "Error in PATCH /melpethostel/hospedagens/solicitacoes/:id/checkin:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});
router.get("/hospedagens/pagamentos/:id/preview", async (req, res) => {
  try {
    if (!(await requireHostingAdmin(req, res))) return;
    const pagamentoId = Number(req.params?.id);
    if (!Number.isInteger(pagamentoId) || pagamentoId <= 0)
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Pagamento inválido." });
    await ensureHostingPaymentsTable(req);
    const [rows] = await dbFor(req).query(
      "SELECT comprovante_path, comprovante_nome FROM " +
        qtable(TABLE_NAMES.hospedagemPagamentos) +
        " WHERE id = ? LIMIT 1",
      [pagamentoId],
    );
    const pagamento = rows && rows[0] ? rows[0] : null;
    const storedPath = clean(pagamento?.comprovante_path);
    if (!storedPath)
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Comprovante não encontrado." });
    const diskPath = resolveUploadsFileToDisk(storedPath);
    const buffer = await fs.readFile(diskPath);
    const ext = path.extname(storedPath).toLowerCase();
    const contentType =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : "application/pdf";
    return res.json({
      status: "sucesso",
      contentType,
      fileName: pagamento.comprovante_nome || path.basename(storedPath),
      base64: buffer.toString("base64"),
    });
  } catch (error) {
    console.error(
      "Error in GET /melpethostel/hospedagens/pagamentos/:id/preview:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.patch("/hospedagens/pagamentos/:id/aprovar", async (req, res) => {
  try {
    if (!(await requireHostingAdmin(req, res))) return;
    const pagamentoId = Number(req.params?.id);
    if (!Number.isInteger(pagamentoId) || pagamentoId <= 0)
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Pagamento inválido." });
    await ensureHostingPaymentsTable(req);
    const [rows] = await dbFor(req).query(
      "SELECT id, solicitacao_id, status FROM " +
        qtable(TABLE_NAMES.hospedagemPagamentos) +
        " WHERE id = ? LIMIT 1",
      [pagamentoId],
    );
    const pagamento = rows && rows[0] ? rows[0] : null;
    if (!pagamento)
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Pagamento não encontrado." });
    if (pagamento.status !== "comprovante_enviado")
      return res.status(409).json({
        status: "erro",
        mensagem: "Este comprovante não está pendente de conferência.",
      });
    await dbFor(req).query(
      "UPDATE " +
        qtable(TABLE_NAMES.hospedagemPagamentos) +
        " SET status = 'confirmado', conferido_por = ?, conferido_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
      [getReqLogin(req), pagamentoId],
    );
    await ensureHostingMonthlyPaymentsTable(req);
    await dbFor(req).query(
      "UPDATE " +
        qtable(TABLE_NAMES.hospedagemMensalidades) +
        " SET status = 'confirmado', atualizado_em = CURRENT_TIMESTAMP WHERE pagamento_id = ?",
      [pagamentoId],
    );
    const [pendingRows] = await dbFor(req).query(
      "SELECT COUNT(*) AS total FROM " +
        qtable(TABLE_NAMES.hospedagemPagamentos) +
        " WHERE solicitacao_id = ? AND status <> 'confirmado'",
      [pagamento.solicitacao_id],
    );
    if (Number(pendingRows?.[0]?.total || 0) === 0) {
      const table = await resolveTableName(
        req,
        TABLE_NAMES.hospedagemSolicitacoes,
      );
      if (table)
        await dbFor(req).query(
          "UPDATE " +
            qtable(table) +
            " SET status = 'confirmado', atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
          [pagamento.solicitacao_id],
        );
    }
    return res.json({
      status: "sucesso",
      mensagem: "Comprovante aprovado com sucesso.",
    });
  } catch (error) {
    console.error(
      "Error in PATCH /melpethostel/hospedagens/pagamentos/:id/aprovar:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.patch("/hospedagens/pagamentos/:id/reprovar", async (req, res) => {
  try {
    if (!(await requireHostingAdmin(req, res))) return;
    const pagamentoId = Number(req.params?.id);
    const motivoRecusa = clean(
      req.body?.motivoRecusa || req.body?.motivoReprovacao,
    );
    if (!Number.isInteger(pagamentoId) || pagamentoId <= 0)
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Pagamento inválido." });
    if (!motivoRecusa)
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Informe o motivo da recusa." });
    await ensureHostingPaymentsTable(req);
    const [rows] = await dbFor(req).query(
      "SELECT id, status, comprovante_path FROM " +
        qtable(TABLE_NAMES.hospedagemPagamentos) +
        " WHERE id = ? LIMIT 1",
      [pagamentoId],
    );
    const pagamento = rows && rows[0] ? rows[0] : null;
    if (!pagamento)
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Pagamento não encontrado." });
    if (pagamento.status !== "comprovante_enviado")
      return res.status(409).json({
        status: "erro",
        mensagem: "Este comprovante não está pendente de conferência.",
      });
    const comprovantePath = clean(pagamento.comprovante_path);
    if (comprovantePath) {
      try {
        await fs.unlink(resolveUploadsFileToDisk(comprovantePath));
      } catch (fileError) {
        if (fileError?.code !== "ENOENT") throw fileError;
      }
    }
    await dbFor(req).query(
      "UPDATE " +
        qtable(TABLE_NAMES.hospedagemPagamentos) +
        " SET status = 'reprovado', motivo_recusa = ?, comprovante_path = NULL, comprovante_nome = NULL, conferido_por = ?, conferido_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
      [motivoRecusa, getReqLogin(req), pagamentoId],
    );
    await ensureHostingMonthlyPaymentsTable(req);
    await dbFor(req).query(
      "UPDATE " +
        qtable(TABLE_NAMES.hospedagemMensalidades) +
        " SET status = 'reprovado', atualizado_em = CURRENT_TIMESTAMP WHERE pagamento_id = ?",
      [pagamentoId],
    );
    return res.json({
      status: "sucesso",
      mensagem: "Comprovante recusado com sucesso.",
    });
  } catch (error) {
    console.error(
      "Error in PATCH /melpethostel/hospedagens/pagamentos/:id/reprovar:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post(
  "/hospedagens/solicitacoes/:id/comprovante",
  uploadContrato.single("arquivo"),
  async (req, res) => {
    try {
      const clienteId = await getCurrentClienteId(req);
      const login = getReqLogin(req);
      const solicitacaoId = Number(req.params?.id);
      const parcelaTipo = clean(
        req.body?.parcelaTipo || req.body?.parcela_tipo || "total",
      ).toLowerCase();
      if (!clienteId || !login)
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Cliente não identificado." });
      if (!Number.isInteger(solicitacaoId) || solicitacaoId <= 0)
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Solicitação inválida." });
      if (!req.file || !req.file.buffer)
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Arquivo é obrigatório." });
      const originalName = String(req.file.originalname || "").toLowerCase();
      const mime = String(req.file.mimetype || "").toLowerCase();
      const allowed =
        originalName.endsWith(".pdf") ||
        originalName.endsWith(".jpg") ||
        originalName.endsWith(".jpeg") ||
        originalName.endsWith(".png") ||
        mime === "application/pdf" ||
        mime.startsWith("image/");
      if (!allowed)
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Envie PDF, JPG ou PNG." });
      const table = await resolveTableName(
        req,
        TABLE_NAMES.hospedagemSolicitacoes,
      );
      if (!table)
        return res.status(500).json({
          status: "erro",
          mensagem: "Tabela de hospedagem não encontrada.",
        });
      const [rows] = await dbFor(req).query(
        "SELECT id, cliente_id, status FROM " +
          qtable(table) +
          " WHERE id = ? AND cliente_id = ? LIMIT 1",
        [solicitacaoId, clienteId],
      );
      const solicitacao = rows && rows[0] ? rows[0] : null;
      if (!solicitacao)
        return res
          .status(404)
          .json({ status: "erro", mensagem: "Solicitação não encontrada." });
      if (normalizeHostingStatus(solicitacao.status) !== "aprovado")
        return res.status(409).json({
          status: "erro",
          mensagem: "Comprovante disponível apenas para hospedagem aprovada.",
        });
      await ensureHostingPaymentsTable(req);
      const user = await getUsuarioByLogin(req, login);
      if (!user?.Usuario_ID)
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Usuário inválido." });
      const storage = await ensureUserDocumentStorage(req, login);
      if (!storage?.relativeDir)
        return res.status(400).json({
          status: "erro",
          mensagem: "Usuário sem grupo configurado para salvar comprovante.",
        });
      const comprovantesRelativeDir =
        storage.relativeDir.replace(/\/$/, "") + "/comprovantes";
      const diskDir = resolveUploadsDirToDisk(comprovantesRelativeDir);
      await fs.mkdir(diskDir, { recursive: true });
      const ext = path.extname(req.file.originalname || "") || ".pdf";
      const nomeArquivo =
        "Comprovante-Hospedagem-" +
        solicitacaoId +
        "-" +
        new Date()
          .toISOString()
          .replace(/[-:T.Z]/g, "")
          .slice(0, 14) +
        ext.toLowerCase();
      const filePath = (comprovantesRelativeDir + "/" + nomeArquivo).replace(
        /\\/g,
        "/",
      );
      await fs.writeFile(path.join(diskDir, nomeArquivo), req.file.buffer);
      await dbFor(req).query(
        "UPDATE " +
          qtable(TABLE_NAMES.hospedagemPagamentos) +
          " SET comprovante_path = ?, comprovante_nome = ?, status = ?, motivo_recusa = NULL, enviado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP WHERE solicitacao_id = ? AND cliente_id = ? AND parcela_tipo = ?",
        [
          filePath,
          nomeArquivo,
          "comprovante_enviado",
          solicitacaoId,
          clienteId,
          parcelaTipo,
        ],
      );
      const [pagamentoRows] = await dbFor(req).query(
        "SELECT id, valor, parcela_tipo FROM " +
          qtable(TABLE_NAMES.hospedagemPagamentos) +
          " WHERE solicitacao_id = ? AND cliente_id = ? AND parcela_tipo = ? LIMIT 1",
        [solicitacaoId, clienteId, parcelaTipo],
      );
      const pagamentoAtual = pagamentoRows?.[0] || null;
      const mensalMatch = clean(pagamentoAtual?.parcela_tipo).match(
        /^mensal_(\d{4})_(\d{2})$/,
      );
      if (mensalMatch) {
        await ensureHostingMonthlyPaymentsTable(req);
        await dbFor(req).query(
          "INSERT INTO " +
            qtable(TABLE_NAMES.hospedagemMensalidades) +
            " (solicitacao_id, cliente_id, competencia, pagamento_id, valor, status) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE pagamento_id = VALUES(pagamento_id), valor = VALUES(valor), status = VALUES(status), atualizado_em = CURRENT_TIMESTAMP",
          [
            solicitacaoId,
            clienteId,
            `${mensalMatch[1]}-${mensalMatch[2]}`,
            pagamentoAtual.id,
            pagamentoAtual.valor,
            "comprovante_enviado",
          ],
        );
      }
      const pedidoCompleto = await loadHostingRequestById(req, solicitacaoId);
      await notifyHostingReceiptAdmins(req, {
        login,
        request: pedidoCompleto || solicitacao,
        parcelaTipo,
        valor: pagamentoRows?.[0]?.valor,
      }).catch((telegramError) => {
        console.error(
          "Erro notificando comprovante de hospedagem no Telegram:",
          telegramError,
        );
      });
      return res.json({
        status: "sucesso",
        mensagem: "Comprovante enviado com sucesso.",
        pagamento: {
          comprovantePath: filePath,
          comprovanteUrl: toPublicUploadPath(filePath),
          comprovanteNome: nomeArquivo,
          status: "comprovante_enviado",
        },
      });
    } catch (error) {
      console.error(
        "Error in POST /melpethostel/hospedagens/solicitacoes/:id/comprovante:",
        error,
      );
      return res.status(500).json({ status: "erro", mensagem: error.message });
    }
  },
);
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
        SELECT id, status, modo_cobranca
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

    const monthlyConfirmed =
      normalizeHostingStatus(solicitacao.status) === "confirmado" &&
      normalizeBillingMode(solicitacao.modo_cobranca) === "mensal";
    if (monthlyConfirmed && !isCurrentMonthEnd()) {
      const fullRequest = await loadHostingRequestById(req, solicitacaoId);
      if (fullRequest) await ensureCurrentMonthlyPayment(req, fullRequest);
      await ensureHostingMonthlyPaymentsTable(req);
      const competencia = getActiveMonthlyCompetence(fullRequest || solicitacao);
      const validUntil = formatShortDate(getCurrentMonthEndDate());
      await db.query(
        "UPDATE " +
          qtable(TABLE_NAMES.hospedagemMensalidades) +
          " SET status = 'cancelamento_solicitado', solicitado_cancelamento_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP WHERE solicitacao_id = ? AND cliente_id = ? AND competencia = ?",
        [solicitacaoId, clienteId, competencia],
      );
      return res.json({
        status: "sucesso",
        mensagem:
          "Pedido de cancelamento efetuado. Hospedagem valida ate " +
          validUntil,
        solicitacao: {
          id: solicitacaoId,
          status: solicitacao.status,
          mensalidadeStatus: "cancelamento_solicitado",
          competencia,
          validadeAte: validUntil,
        },
      });
    }

    const nextStatus = monthlyConfirmed
      ? "cancelado"
      : getAllowedHostingStatusTransition(solicitacao.status);
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
