const express = require("express");
const router = express.Router();
const {
  TABLE_NAMES,
  buildSupportDocumentFileName,
  checkAllRequiredDocsConcluded,
  dbFor,
  fileExistsByStoredPath,
  fileExistsOnDisk,
  fs,
  getContratosTableMeta,
  getDocumentosTableMeta,
  getDocumentoTipoById,
  getDocumentoTipos,
  getLatestContratoRow,
  getReqLogin,
  getUsuarioById,
  getUsuarioByLogin,
  isTruthyFlag,
  isValidDbDate,
  isContratoConferido,
  listUsuariosForDocuments,
  mapRequiredDocKey,
  path,
  qcol,
  qtable,
  requireCompleteClienteCadastro,
  resolveTableName,
  resolveUploadsDirToDisk,
  resolveUserDocumentsRelativeDir,
  toPublicUploadPath,
  uploadContrato,
} = require("./context");

router.get("/documentos/pendentes", async (req, res) => {
  try {
    const login = getReqLogin(req);
    if (!login) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Usuário não identificado" });
    }

    const meta = await getContratosTableMeta(req);
    if (!meta.exists || !meta.idCol) {
      return res.status(500).json({
        status: "erro",
        mensagem: `Tabela ${TABLE_NAMES.contratos} não está pronta para varredura.`,
      });
    }

    const users = await listUsuariosForDocuments(req);

    const pendentes = [];
    for (const user of users || []) {
      if (!user?.Usuario_ID || !user?.Usuario_Login) continue;

      const latestContrato = await getLatestContratoRow(
        req,
        meta,
        user.Usuario_Login,
      );
      if (!latestContrato || !latestContrato[meta.idCol]) continue;

      const nomeArquivo = meta.nomeArquivoCol
        ? latestContrato[meta.nomeArquivoCol]
        : null;
      const filePath = meta.filePathCol
        ? latestContrato[meta.filePathCol]
        : null;
      const arquivoExiste = await fileExistsOnDisk(filePath, nomeArquivo);
      if (!arquivoExiste) continue;

      const conferido = isContratoConferido(latestContrato, meta);
      if (conferido) continue;

      const requiredDocsComplete = await checkAllRequiredDocsConcluded(
        req,
        user.Usuario_ID,
        latestContrato[meta.idCol],
      );
      if (!requiredDocsComplete) continue;

      pendentes.push({
        usuarioId: user.Usuario_ID,
        nome: user.Usuario_Login,
      });
    }

    return res.json({
      status: "sucesso",
      total: pendentes.length,
      usuarios: pendentes,
    });
  } catch (error) {
    console.error("Error in GET /melpethostel/documentos/pendentes:", error);
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.get("/documentos/usuario/:usuarioId/arquivos", async (req, res) => {
  try {
    const login = getReqLogin(req);
    if (!login) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Usuário não identificado" });
    }

    const usuarioId = Number(req.params.usuarioId);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "usuarioId inválido" });
    }

    const user = await getUsuarioById(req, usuarioId);
    if (!user) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Usuário não encontrado" });
    }

    const meta = await getContratosTableMeta(req);
    if (!meta.exists || !meta.idCol) {
      return res.status(500).json({
        status: "erro",
        mensagem: `Tabela ${TABLE_NAMES.contratos} não está pronta.`,
      });
    }

    const latestContrato = await getLatestContratoRow(
      req,
      meta,
      user.Usuario_Login,
    );
    if (!latestContrato || !latestContrato[meta.idCol]) {
      return res.json({
        status: "sucesso",
        usuario: { id: user.Usuario_ID, nome: user.Usuario_Login },
        contratoId: null,
        arquivos: [],
      });
    }

    const contratoId = latestContrato[meta.idCol];
    const arquivos = [];

    const nomeArquivoContrato = meta.nomeArquivoCol
      ? latestContrato[meta.nomeArquivoCol]
      : null;
    const filePathContrato = meta.filePathCol
      ? latestContrato[meta.filePathCol]
      : null;

    if (nomeArquivoContrato && filePathContrato) {
      const existsDisk = await fileExistsOnDisk(
        filePathContrato,
        nomeArquivoContrato,
      );
      const storedPath = `${String(filePathContrato).replace(/\/+$/, "")}/${String(nomeArquivoContrato)}`;
      const contratoConferido = isContratoConferido(latestContrato, meta);
      arquivos.push({
        tipoRegistro: "contrato",
        contratoId,
        nomeDocumento: String(nomeArquivoContrato),
        tipoDocumento: "Contrato Assinado",
        filePath: storedPath,
        fileUrl: existsDisk ? toPublicUploadPath(storedPath) : null,
        existsDisk,
        conferido: contratoConferido,
        conferidoAt: meta.conferidoAtCol
          ? latestContrato[meta.conferidoAtCol] || null
          : null,
        conferidoPor: meta.conferidoPorCol
          ? latestContrato[meta.conferidoPorCol] || null
          : null,
      });
    }

    const docsMeta = await getDocumentosTableMeta(req);
    const tipoTableName =
      (await resolveTableName(req, TABLE_NAMES.documentosTipo)) ||
      TABLE_NAMES.documentosTipo;
    const docsSelectCols = [
      `d.${qcol(docsMeta.idCol || "Id")} AS docId`,
      `d.${qcol(docsMeta.filePathCol || "File_Path")} AS filePath`,
      "t.Documento_Tipo AS tipoDocumento",
    ];
    if (docsMeta.conferidoCol) {
      docsSelectCols.push(
        `d.${qcol(docsMeta.conferidoCol)} AS docConferidoFlag`,
      );
    }
    if (docsMeta.conferidoAtCol) {
      docsSelectCols.push(
        `d.${qcol(docsMeta.conferidoAtCol)} AS docConferidoAt`,
      );
    }
    if (docsMeta.conferidoPorCol) {
      docsSelectCols.push(
        `d.${qcol(docsMeta.conferidoPorCol)} AS docConferidoPor`,
      );
    }

    const [docRows] = await dbFor(req).query(
      `
        SELECT ${docsSelectCols.join(", ")}
        FROM ${qtable(docsMeta.tableName)} d
        LEFT JOIN ${qtable(tipoTableName)} t ON t.Id = d.${qcol(docsMeta.tipoIdCol || "Documento_Tipo_ID")}
        WHERE d.${qcol(docsMeta.usuarioIdCol || "Usuario_ID")} = ?
          AND d.${qcol(docsMeta.contratoIdCol || "Contrato_ID")} = ?
        ORDER BY d.${qcol(docsMeta.idCol || "Id")} ASC
      `,
      [user.Usuario_ID, contratoId],
    );

    for (const doc of docRows || []) {
      const storedPath = String(doc?.filePath || "").trim();
      if (!storedPath) continue;
      const existsDisk = await fileExistsByStoredPath(storedPath);
      const fileName = path.basename(storedPath);
      const conferido =
        isTruthyFlag(doc?.docConferidoFlag) ||
        isValidDbDate(doc?.docConferidoAt);
      arquivos.push({
        tipoRegistro: "documento",
        documentoId: doc?.docId || null,
        nomeDocumento: fileName || "Documento",
        tipoDocumento: doc?.tipoDocumento || "Documento",
        filePath: storedPath,
        fileUrl: existsDisk ? toPublicUploadPath(storedPath) : null,
        existsDisk,
        conferido,
        conferidoAt: doc?.docConferidoAt || null,
        conferidoPor: doc?.docConferidoPor || null,
      });
    }

    return res.json({
      status: "sucesso",
      usuario: { id: user.Usuario_ID, nome: user.Usuario_Login },
      contratoId,
      arquivos,
    });
  } catch (error) {
    console.error(
      "Error in GET /melpethostel/documentos/usuario/:usuarioId/arquivos:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post("/documentos/:documentoId/conferir", async (req, res) => {
  try {
    const login = getReqLogin(req);
    if (!login) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Usuário não identificado" });
    }

    const documentoId = Number(req.params.documentoId);
    if (!Number.isInteger(documentoId) || documentoId <= 0) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "documentoId inválido" });
    }

    const docsMeta = await getDocumentosTableMeta(req);
    if (!docsMeta.exists || !docsMeta.idCol) {
      return res.status(500).json({
        status: "erro",
        mensagem: `Tabela ${TABLE_NAMES.documentos} não está pronta.`,
      });
    }

    if (
      !docsMeta.conferidoCol ||
      !docsMeta.conferidoAtCol ||
      !docsMeta.conferidoPorCol
    ) {
      return res.status(500).json({
        status: "erro",
        mensagem:
          `Colunas de conferência ausentes em ${TABLE_NAMES.documentos}. Execute o script add_conferido_columns_to_melpethostel_documentos.sql.`,
      });
    }

    const [existingRows] = await dbFor(req).query(
      `
        SELECT ${qcol(docsMeta.idCol)} AS id
        FROM ${qtable(docsMeta.tableName)}
        WHERE ${qcol(docsMeta.idCol)} = ?
        LIMIT 1
      `,
      [documentoId],
    );

    if (!existingRows || !existingRows.length) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Documento não encontrado" });
    }

    await dbFor(req).query(
      `
        UPDATE ${qtable(docsMeta.tableName)}
        SET ${qcol(docsMeta.conferidoCol)} = 1,
            ${qcol(docsMeta.conferidoAtCol)} = NOW(),
            ${qcol(docsMeta.conferidoPorCol)} = ?
        WHERE ${qcol(docsMeta.idCol)} = ?
      `,
      [login, documentoId],
    );

    return res.json({
      status: "sucesso",
      mensagem: "Documento conferido com sucesso.",
      documento: {
        id: documentoId,
        conferido: true,
        conferidoPor: login,
      },
    });
  } catch (error) {
    console.error(
      "Error in POST /melpethostel/documentos/:documentoId/conferir:",
      error,
    );
    return res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.get("/documentos/tipos", async (req, res) => {
  try {
    const tipos = await getDocumentoTipos(req);
    return res.json({ status: "sucesso", tipos });
  } catch (error) {
    console.error("Error in GET /melpethostel/documentos/tipos:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.get("/documentos/status", async (req, res) => {
  try {
    const login = getReqLogin(req);
    if (!login) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Usuário não identificado" });
    }

    const userRow = await getUsuarioByLogin(req, login);
    if (!userRow || !userRow.Usuario_ID) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Usuário não encontrado" });
    }

    const meta = await getContratosTableMeta(req);
    if (!meta.exists || !meta.idCol) {
      return res.status(500).json({
        status: "erro",
        mensagem:
          `Tabela ${TABLE_NAMES.contratos} não está pronta para verificação.`,
      });
    }

    const latestContrato = await getLatestContratoRow(req, meta, login);
    if (!latestContrato || !latestContrato[meta.idCol]) {
      return res.json({ status: "sucesso", documentos: [] });
    }

    const contratoId = latestContrato[meta.idCol];
    const tipos = await getDocumentoTipos(req);
    const docsMeta = await getDocumentosTableMeta(req);
    if (
      !docsMeta.exists ||
      !docsMeta.usuarioIdCol ||
      !docsMeta.contratoIdCol ||
      !docsMeta.tipoIdCol ||
      !docsMeta.filePathCol
    ) {
      return res.status(500).json({
        status: "erro",
        mensagem: `Tabela ${TABLE_NAMES.documentos} nao esta pronta para verificacao.`,
      });
    }

    const [docRows] = await dbFor(req).query(
      `
        SELECT ${qcol(docsMeta.tipoIdCol)} AS tipoId,
               ${qcol(docsMeta.filePathCol)} AS filePath
        FROM ${qtable(docsMeta.tableName)}
        WHERE ${qcol(docsMeta.usuarioIdCol)} = ?
          AND ${qcol(docsMeta.contratoIdCol)} = ?
      `,
      [userRow.Usuario_ID, contratoId],
    );

    const docsByTipoId = new Map();
    for (const d of docRows || []) {
      const tipoId = Number(d.tipoId);
      const existing = docsByTipoId.get(tipoId) || [];
      existing.push(d);
      docsByTipoId.set(tipoId, existing);
    }

    const documentos = [];
    for (const tipo of tipos) {
      const docsForTipo = docsByTipoId.get(Number(tipo.Id)) || [];
      const doc = docsForTipo.length
        ? docsForTipo[docsForTipo.length - 1]
        : null;

      let identifiedCount = 0;
      for (const candidate of docsForTipo) {
        if (!candidate?.filePath) continue;
        if (await fileExistsByStoredPath(candidate.filePath)) {
          identifiedCount += 1;
        }
      }

      const existsDb = docsForTipo.some((candidate) =>
        Boolean(candidate?.filePath),
      );
      const existsDisk = identifiedCount > 0;

      const requiredKey = mapRequiredDocKey(tipo.Documento_Tipo);
      documentos.push({
        tipoId: tipo.Id,
        tipoNome: tipo.Documento_Tipo,
        key: requiredKey,
        required: requiredKey !== "outros",
        existsDb,
        existsDisk,
        identifiedCount,
        status: existsDb && existsDisk ? "concluido" : "pendente",
        filePath: doc && doc.filePath ? doc.filePath : null,
      });
    }

    return res.json({ status: "sucesso", documentos });
  } catch (error) {
    console.error("Error in GET /melpethostel/documentos/status:", error);
    res.status(500).json({ status: "erro", mensagem: error.message });
  }
});

router.post(
  "/documentos/upload",
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

      const tipoId = Number(req.body && req.body.tipoId);
      if (!Number.isInteger(tipoId) || tipoId <= 0) {
        return res.status(400).json({
          status: "erro",
          mensagem: "tipoId é obrigatório para upload do documento.",
        });
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

      const tipo = await getDocumentoTipoById(req, tipoId);
      if (!tipo) {
        return res
          .status(400)
          .json({ status: "erro", mensagem: "Tipo de documento inválido." });
      }

      const userRow = await getUsuarioByLogin(req, login);
      if (!userRow || !userRow.Usuario_ID) {
        return res.status(400).json({
          status: "erro",
          mensagem: "Usuário não encontrado para vincular o documento.",
        });
      }

      const meta = await getContratosTableMeta(req);
      if (!meta.exists || !meta.idCol) {
        return res.status(500).json({
          status: "erro",
          mensagem:
            `Tabela ${TABLE_NAMES.contratos} não está pronta para vincular documento (ID ausente).`,
        });
      }

      const latestContrato = await getLatestContratoRow(req, meta, login);
      if (!latestContrato) {
        return res.status(400).json({
          status: "erro",
          mensagem: "Nenhum contrato encontrado para vincular o documento.",
        });
      }

      const contratoId = latestContrato[meta.idCol];
      if (!contratoId) {
        return res.status(400).json({
          status: "erro",
          mensagem: "Contrato inválido para vincular o documento.",
        });
      }

      const userDirData = await resolveUserDocumentsRelativeDir(req, login);
      if (!userDirData) {
        return res.status(400).json({
          status: "erro",
          mensagem: "Usuário sem grupo configurado para salvar documento.",
        });
      }

      const { relativeDir, safeUsuario } = userDirData;
      const docKey = mapRequiredDocKey(tipo.Documento_Tipo);
      const diskDir = resolveUploadsDirToDisk(relativeDir);
      await fs.mkdir(diskDir, { recursive: true });

      const docsMeta = await getDocumentosTableMeta(req);
      if (
        !docsMeta.exists ||
        !docsMeta.idCol ||
        !docsMeta.usuarioIdCol ||
        !docsMeta.contratoIdCol ||
        !docsMeta.tipoIdCol ||
        !docsMeta.filePathCol
      ) {
        return res.status(500).json({
          status: "erro",
          mensagem: `Tabela ${TABLE_NAMES.documentos} nao esta pronta para upload (colunas obrigatorias ausentes).`,
        });
      }

      const [existingRows] = await dbFor(req).query(
        `
          SELECT ${qcol(docsMeta.idCol)} AS id,
                 ${qcol(docsMeta.filePathCol)} AS filePath
          FROM ${qtable(docsMeta.tableName)}
          WHERE ${qcol(docsMeta.usuarioIdCol)} = ?
            AND ${qcol(docsMeta.contratoIdCol)} = ?
            AND ${qcol(docsMeta.tipoIdCol)} = ?
          ORDER BY ${qcol(docsMeta.idCol)}
        `,
        [userRow.Usuario_ID, contratoId, tipo.Id],
      );

      let finalFileName = buildSupportDocumentFileName(safeUsuario, docKey);
      if (docKey === "outros") {
        let sequence = (existingRows || []).length + 1;
        while (true) {
          const candidateName = buildSupportDocumentFileName(
            safeUsuario,
            docKey,
            sequence,
          );
          const candidatePath = path.join(diskDir, candidateName);
          try {
            await fs.access(candidatePath);
            sequence += 1;
          } catch {
            finalFileName = candidateName;
            break;
          }
        }
      }

      const fullPath = path.join(diskDir, finalFileName);
      await fs.writeFile(fullPath, req.file.buffer);

      const filePath = `${relativeDir}/${finalFileName}`.replace(/\\/g, "/");

      if (docKey === "outros") {
        await dbFor(req).query(
          `
            INSERT INTO ${qtable(docsMeta.tableName)}
              (${[
                docsMeta.usuarioIdCol,
                docsMeta.contratoIdCol,
                docsMeta.tipoIdCol,
                docsMeta.filePathCol,
              ]
                .map(qcol)
                .join(", ")})
            VALUES (?, ?, ?, ?)
          `,
          [userRow.Usuario_ID, contratoId, tipo.Id, filePath],
        );
      } else if (existingRows && existingRows.length) {
        await dbFor(req).query(
          `
            UPDATE ${qtable(docsMeta.tableName)}
            SET ${qcol(docsMeta.filePathCol)} = ?
            WHERE ${qcol(docsMeta.idCol)} = ?
          `,
          [filePath, existingRows[0].id],
        );
      } else {
        await dbFor(req).query(
          `
            INSERT INTO ${qtable(docsMeta.tableName)}
              (${[
                docsMeta.usuarioIdCol,
                docsMeta.contratoIdCol,
                docsMeta.tipoIdCol,
                docsMeta.filePathCol,
              ]
                .map(qcol)
                .join(", ")})
            VALUES (?, ?, ?, ?)
          `,
          [userRow.Usuario_ID, contratoId, tipo.Id, filePath],
        );
      }

      return res.json({
        status: "sucesso",
        mensagem: "Documento enviado com sucesso",
        documento: {
          tipoId: tipo.Id,
          tipoNome: tipo.Documento_Tipo,
          filePath,
        },
      });
    } catch (error) {
      if (
        error?.code === "ER_DUP_ENTRY" &&
        String(error?.message || "").includes(
          "uq_mph_doc_usuario_contrato_tipo",
        )
      ) {
        return res.status(409).json({
          status: "erro",
          mensagem:
            `A base ainda está com chave única em ${TABLE_NAMES.documentos}. Execute o script API/scripts/drop_unique_mph_documentos.sql para permitir múltiplos 'Outros Documentos'.`,
        });
      }

      console.error("Error in POST /melpethostel/documentos/upload:", error);
      res.status(500).json({ status: "erro", mensagem: error.message });
    }
  },
);

// List groups

module.exports = router;
