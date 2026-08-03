const express = require("express");
const router = express.Router();
const {
  TABLE_NAMES,
  checkAllDocsConferidosByContratoId,
  dbFor,
  fileExistsOnDisk,
  fs,
  getContratosTableMeta,
  getLatestContratoRow,
  getReqLogin,
  isContratoConferido,
  path,
  qcol,
  qtable,
  requireCompleteClienteCadastro,
  resolveUploadsDirToDisk,
  resolveUserDocumentsRelativeDir,
  uploadContrato,
} = require("./context");

router.get("/contratos/status", async (req, res) => {
  try {
    const login = getReqLogin(req);
    if (!login) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Usuário não identificado" });
    }

    const meta = await getContratosTableMeta(req);
    if (!meta.exists) {
      return res.json({
        status: "sucesso",
        contrato: null,
        possuiContratoDb: false,
        arquivoExiste: false,
        conferido: false,
        contratoValido: false,
      });
    }

    const row = await getLatestContratoRow(req, meta, login);
    if (!row) {
      return res.json({
        status: "sucesso",
        contrato: null,
        possuiContratoDb: false,
        arquivoExiste: false,
        conferido: false,
        contratoValido: false,
      });
    }

    const nomeArquivo = meta.nomeArquivoCol ? row[meta.nomeArquivoCol] : null;
    const filePath = meta.filePathCol ? row[meta.filePathCol] : null;
    const arquivoExiste = await fileExistsOnDisk(filePath, nomeArquivo);

    const conferido = isContratoConferido(row, meta);

    const contratoValido = Boolean(arquivoExiste && conferido);

    return res.json({
      status: "sucesso",
      contrato: {
        nomeArquivo: nomeArquivo || null,
        filePath: filePath || null,
      },
      possuiContratoDb: true,
      arquivoExiste,
      conferido,
      contratoValido,
    });
  } catch (error) {
    console.error("Error in GET /melpethostel/contratos/status:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post("/contratos/:contratoId/conferir", async (req, res) => {
  try {
    const login = getReqLogin(req);
    if (!login) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Usuário não identificado" });
    }

    const contratoId = Number(req.params.contratoId);
    if (!Number.isInteger(contratoId) || contratoId <= 0) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "contratoId inválido" });
    }

    const meta = await getContratosTableMeta(req);
    if (!meta.exists || !meta.idCol) {
      return res.status(500).json({
        status: "erro",
        mensagem: `Tabela ${TABLE_NAMES.contratos} não está pronta.`,
      });
    }

    if (!meta.conferidoCol || !meta.conferidoAtCol || !meta.conferidoPorCol) {
      return res.status(500).json({
        status: "erro",
        mensagem: `Colunas de conferência ausentes em ${TABLE_NAMES.contratos}.`,
      });
    }

    const [existingRows] = await dbFor(req).query(
      `
        SELECT ${qcol(meta.idCol)} AS id
        FROM ${qtable(meta.tableName)}
        WHERE ${qcol(meta.idCol)} = ?
        LIMIT 1
      `,
      [contratoId],
    );

    if (!existingRows || !existingRows.length) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Contrato não encontrado" });
    }

    const docsCheck = await checkAllDocsConferidosByContratoId(req, contratoId);
    if (!docsCheck.ok) {
      const mensagem =
        docsCheck.reason === "metadata_missing"
          ? `Tabela ${TABLE_NAMES.documentos} sem colunas de conferência para validar os documentos.`
          : docsCheck.reason === "no_documents"
            ? "Não há documentos vinculados para conferir este contrato."
            : `Ainda existem ${docsCheck.pendentes} documento(s) sem conferência.`;
      return res.status(409).json({ status: "erro", mensagem });
    }

    await dbFor(req).query(
      `
        UPDATE ${qtable(meta.tableName)}
        SET ${qcol(meta.conferidoCol)} = 1,
            ${qcol(meta.conferidoAtCol)} = NOW(),
            ${qcol(meta.conferidoPorCol)} = ?
        WHERE ${qcol(meta.idCol)} = ?
      `,
      [login, contratoId],
    );

    return res.json({
      status: "sucesso",
      mensagem: "Contrato conferido com sucesso.",
      contrato: {
        id: contratoId,
        conferido: true,
        conferidoPor: login,
      },
    });
  } catch (error) {
    console.error(
      "Error in POST /melpethostel/contratos/:contratoId/conferir:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post(
  "/contratos/upload",
  uploadContrato.single("arquivo"),
  async (req, res) => {
    try {
      const login = getReqLogin(req);
      if (!login) {
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Usuário não identificado" });
      }

      if (!req.file || !req.file.buffer) {
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Arquivo é obrigatório" });
      }

      const originalName = String(req.file.originalname || "").toLowerCase();
      const mime = String(req.file.mimetype || "").toLowerCase();
      const isPdf = originalName.endsWith(".pdf") || mime === "application/pdf";
      if (!isPdf) {
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Envie um arquivo PDF" });
      }

      if (!(await requireCompleteClienteCadastro(req, res, login))) return;

      const meta = await getContratosTableMeta(req);
      const missingUploadColumns = [
        !meta.exists ? "tabela" : null,
        !meta.loginCol ? "Usuario_Login/usuario_login" : null,
        !meta.nomeArquivoCol ? "Nome_Arquivo/nome_arquivo" : null,
        !meta.filePathCol ? "File_Path/file_path" : null,
      ].filter(Boolean);
      if (
        !meta.exists ||
        !meta.loginCol ||
        !meta.nomeArquivoCol ||
        !meta.filePathCol
      ) {
        return res.status(500).json({
          status: "erro",
          mensagem:
            `Tabela ${meta.tableName || TABLE_NAMES.contratos} nao esta pronta para upload. Faltando: ${missingUploadColumns.join(", ")}.`,
        });
      }

      const existingRow = await getLatestContratoRow(req, meta, login);
      const userDirData = await resolveUserDocumentsRelativeDir(req, login);
      if (!userDirData) {
        return res.status(400).json({
          status: "erro",
          mensagem: "Usuário sem grupo configurado para salvar contrato.",
        });
      }

      const { relativeDir, safeUsuario } = userDirData;
      const diskDir = resolveUploadsDirToDisk(relativeDir);
      await fs.mkdir(diskDir, { recursive: true });

      const finalFileName = `${safeUsuario}_Contrato_Assinado.pdf`;
      const fullPath = path.join(diskDir, finalFileName);
      await fs.writeFile(fullPath, req.file.buffer);

      if (existingRow && meta.idCol) {
        const setParts = [
          `${qcol(meta.nomeArquivoCol)} = ?`,
          `${qcol(meta.filePathCol)} = ?`,
        ];
        const params = [finalFileName, relativeDir];

        if (meta.conferidoCol) {
          setParts.push(`${qcol(meta.conferidoCol)} = ?`);
          params.push(0);
        }
        if (meta.conferidoAtCol) {
          setParts.push(`${qcol(meta.conferidoAtCol)} = NULL`);
        }
        if (meta.statusCol) {
          setParts.push(`${qcol(meta.statusCol)} = ?`);
          params.push("pendente");
        }
        params.push(existingRow[meta.idCol]);

        await dbFor(req).query(
          `UPDATE ${qtable(meta.tableName)} SET ${setParts.join(", ")} WHERE ${qcol(meta.idCol)} = ?`,
          params,
        );
      } else {
        const insertCols = [
          meta.loginCol,
          meta.nomeArquivoCol,
          meta.filePathCol,
        ];
        const insertVals = [login, finalFileName, relativeDir];

        if (meta.conferidoCol) {
          insertCols.push(meta.conferidoCol);
          insertVals.push(0);
        }
        if (meta.statusCol) {
          insertCols.push(meta.statusCol);
          insertVals.push("pendente");
        }
        await dbFor(req).query(
          `INSERT INTO ${qtable(meta.tableName)} (${insertCols.map(qcol).join(", ")}) VALUES (${insertCols
            .map(() => "?")
            .join(", ")})`,
          insertVals,
        );
      }

      return res.json({
        status: "sucesso",
        mensagem: "Contrato enviado com sucesso",
        arquivo: {
          nomeArquivo: finalFileName,
          filePath: relativeDir,
        },
      });
    } catch (error) {
      console.error("Error in POST /melpethostel/contratos/upload:", error);
      res.status(500).json({ status: "erro", mensagem: error.message });
    }
  },
);

module.exports = router;
