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

function mapPlano(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    categoriaDe: row.categoria_de,
    categoriaAte: row.categoria_ate,
    unidade: row.unidade || "Kg",
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
            qcol("valor"),
          ].join(", ")})
        VALUES (?, ?, ?, ?, ?)
      `,
      [tipo, categoriaDe, categoriaAte, unidade, valor],
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
            ${qcol("valor")} = ?
        WHERE ${qcol("id")} = ?
          AND ${qcol("ativo")} = 1
      `,
      [tipo, categoriaDe, categoriaAte, unidade, valor, id],
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
