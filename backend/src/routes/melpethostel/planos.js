const express = require("express");
const router = express.Router();
const {
  TABLE_NAMES,
  dbFor,
  qcol,
  qtable,
  resolveTableName,
} = require("./context");

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function parseMoney(value) {
  const normalized = clean(value)
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveInteger(value) {
  const normalized = clean(value)
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeTipoCobranca(value) {
  const normalized = clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (normalized === "mensal" || normalized.includes("mes")) {
    return "mensal";
  }
  return "unico";
}

function normalizeTipoCalculo(value) {
  const normalized = clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (
    normalized === "dia_uso" ||
    normalized.includes("dia uso") ||
    normalized.includes("day")
  ) {
    return "dia_uso";
  }
  return "pernoite";
}

function mapPlano(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    categoriaDe: row.categoria_de,
    categoriaAte: row.categoria_ate,
    unidade: row.unidade || "Kg",
    tipoCobranca: normalizeTipoCobranca(row.tipo_cobranca),
    tipoCalculo: normalizeTipoCalculo(row.tipo_calculo),
    tempoQuantidade: Number(row.tempo_quantidade || 1),
    tempoUnidade: row.tempo_unidade || "dia",
    valor: Number(row.valor),
    ativo: Boolean(row.ativo),
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

router.get("/planos", async (req, res) => {
  try {
    const tableName = await resolveTableName(req, TABLE_NAMES.planos);
    if (!tableName) {
      return res.json({ status: "sucesso", planos: [] });
    }

    const [rows] = await dbFor(req).query(
      `
        SELECT id,
               tipo,
               categoria_de,
               categoria_ate,
               unidade,
               tipo_cobranca,
               tipo_calculo,
               tempo_quantidade,
               tempo_unidade,
               valor,
               ativo,
               criado_em,
               atualizado_em
        FROM ${qtable(tableName)}
        WHERE ativo = 1
        ORDER BY tipo ASC, valor ASC, categoria_de ASC, categoria_ate ASC, id ASC
      `,
    );

    return res.json({
      status: "sucesso",
      planos: (rows || []).map(mapPlano),
    });
  } catch (error) {
    console.error("Error in GET /melpethostel/planos:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post("/planos", async (req, res) => {
  try {
    const tipo = clean(req.body?.tipo);
    const categoriaDe = clean(req.body?.categoriaDe);
    const categoriaAte = clean(req.body?.categoriaAte);
    const unidade = clean(req.body?.unidade) || "Kg";
    const tipoCobranca = normalizeTipoCobranca(req.body?.tipoCobranca);
    const tipoCalculo = normalizeTipoCalculo(req.body?.tipoCalculo);
    const tempoQuantidade = parsePositiveInteger(req.body?.tempoQuantidade);
    const tempoUnidade = clean(req.body?.tempoUnidade);
    const valor = parseMoney(req.body?.valor);

    if (!tipo) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Tipo é obrigatório." });
    }

    if (!categoriaDe) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Categoria DE é obrigatória." });
    }

    if (!categoriaAte) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Categoria ATÉ é obrigatória." });
    }

    if (tempoQuantidade === null) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Quantidade de tempo inválida." });
    }

    if (!tempoUnidade) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Tempo é obrigatório." });
    }

    if (valor === null || valor < 0) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Valor inválido." });
    }

    const tableName = await resolveTableName(req, TABLE_NAMES.planos);
    if (!tableName) {
      return res.status(500).json({
        status: "erro",
        mensagem:
          "Tabela Planos não encontrada. Execute create_planos_schema.sql.",
      });
    }

    const [result] = await dbFor(req).query(
      `
        INSERT INTO ${qtable(tableName)}
          (${[
            qcol("tipo"),
            qcol("categoria_de"),
            qcol("categoria_ate"),
            qcol("unidade"),
            qcol("tipo_cobranca"),
            qcol("tipo_calculo"),
            qcol("tempo_quantidade"),
            qcol("tempo_unidade"),
            qcol("valor"),
          ].join(", ")})
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        tipo,
        categoriaDe,
        categoriaAte,
        unidade,
        tipoCobranca,
        tipoCalculo,
        tempoQuantidade,
        tempoUnidade,
        valor,
      ],
    );

    return res.status(201).json({
      status: "sucesso",
      mensagem: "Plano cadastrado com sucesso.",
      plano: {
        id: result.insertId,
        tipo,
        categoriaDe,
        categoriaAte,
        unidade,
        tipoCobranca,
        tipoCalculo,
        tempoQuantidade,
        tempoUnidade,
        valor,
        ativo: true,
      },
    });
  } catch (error) {
    console.error("Error in POST /melpethostel/planos:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.put("/planos/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const tipo = clean(req.body?.tipo);
    const categoriaDe = clean(req.body?.categoriaDe);
    const categoriaAte = clean(req.body?.categoriaAte);
    const unidade = clean(req.body?.unidade) || "Kg";
    const tipoCobranca = normalizeTipoCobranca(req.body?.tipoCobranca);
    const tipoCalculo = normalizeTipoCalculo(req.body?.tipoCalculo);
    const tempoQuantidade = parsePositiveInteger(req.body?.tempoQuantidade);
    const tempoUnidade = clean(req.body?.tempoUnidade);
    const valor = parseMoney(req.body?.valor);

    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Plano inválido." });
    }

    if (!tipo) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Tipo é obrigatório." });
    }

    if (!categoriaDe) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Categoria DE é obrigatória." });
    }

    if (!categoriaAte) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Categoria ATÉ é obrigatória." });
    }

    if (tempoQuantidade === null) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Quantidade de tempo inválida." });
    }

    if (!tempoUnidade) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Tempo é obrigatório." });
    }

    if (valor === null || valor < 0) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Valor inválido." });
    }

    const tableName = await resolveTableName(req, TABLE_NAMES.planos);
    if (!tableName) {
      return res.status(500).json({
        status: "erro",
        mensagem:
          "Tabela Planos não encontrada. Execute create_planos_schema.sql.",
      });
    }

    const [result] = await dbFor(req).query(
      `
        UPDATE ${qtable(tableName)}
        SET ${qcol("tipo")} = ?,
            ${qcol("categoria_de")} = ?,
            ${qcol("categoria_ate")} = ?,
            ${qcol("unidade")} = ?,
            ${qcol("tipo_cobranca")} = ?,
            ${qcol("tipo_calculo")} = ?,
            ${qcol("tempo_quantidade")} = ?,
            ${qcol("tempo_unidade")} = ?,
            ${qcol("valor")} = ?
        WHERE ${qcol("id")} = ?
          AND ${qcol("ativo")} = 1
      `,
      [
        tipo,
        categoriaDe,
        categoriaAte,
        unidade,
        tipoCobranca,
        tipoCalculo,
        tempoQuantidade,
        tempoUnidade,
        valor,
        id,
      ],
    );

    if (!result || result.affectedRows === 0) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Plano não encontrado." });
    }

    return res.json({
      status: "sucesso",
      mensagem: "Plano atualizado com sucesso.",
      plano: {
        id,
        tipo,
        categoriaDe,
        categoriaAte,
        unidade,
        tipoCobranca,
        tipoCalculo,
        tempoQuantidade,
        tempoUnidade,
        valor,
        ativo: true,
      },
    });
  } catch (error) {
    console.error("Error in PUT /melpethostel/planos/:id:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

module.exports = router;
