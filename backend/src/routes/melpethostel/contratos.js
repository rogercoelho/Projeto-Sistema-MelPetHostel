const express = require("express");
const router = express.Router();
const {
  notifyDocumentUploadForReview,
} = require("../../utils/moduleAccessNotification");
const {
  TABLE_NAMES,
  checkAllDocsConferidosByContratoId,
  dbFor,
  ensureUserDocumentStorage,
  fileExistsOnDisk,
  fs,
  getContratosTableMeta,
  getLatestContratoRow,
  getReqLogin,
  getUsuarioByLogin,
  isContratoConferido,
  path,
  qcol,
  qtable,
  requireCompleteClienteCadastro,
  resolveUploadsDirToDisk,
  resolveUploadsFileToDisk,
  uploadContrato,
} = require("./context");

function rejectedContractDateStamp() {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});

  return parts.day + parts.month + parts.year + "-" + parts.hour + parts.minute + parts.second;
}

async function moveRejectedContractFile(rawDir, rawFileName) {
  const dir = String(rawDir || "").trim().replace(/\\/g, "/");
  const fileName = String(rawFileName || "").trim().replace(/\\/g, "/");
  if (!dir && !fileName) return null;

  const candidates = [];
  if (dir && fileName) candidates.push((dir.replace(/\/+$/, "") + "/" + fileName.replace(/^\/+/, "")).replace(/\\/g, "/"));
  if (dir) candidates.push(dir);
  if (fileName.startsWith("/uploads/") || fileName.startsWith("uploads/")) candidates.push(fileName);

  let sourceStoredPath = null;
  let sourceDiskPath = null;
  for (const candidate of candidates) {
    try {
      const diskPath = resolveUploadsFileToDisk(candidate);
      const stat = await fs.stat(diskPath);
      if (stat && stat.isFile()) {
        sourceStoredPath = candidate.replace(/\\/g, "/");
        sourceDiskPath = diskPath;
        break;
      }
    } catch {
      // Tenta o proximo formato salvo no banco.
    }
  }
  if (!sourceStoredPath || !sourceDiskPath) return null;

  const sourceParts = sourceStoredPath.split("/").filter(Boolean);
  const originalName = sourceParts.pop();
  if (!originalName) return null;

  const sourceRelativeDir = "/" + sourceParts.join("/");
  const targetRelativeDir = (sourceRelativeDir.replace(/\/+$/, "") + "/reprovados").replace(/\\/g, "/");
  const targetDiskDir = resolveUploadsDirToDisk(targetRelativeDir);
  await fs.mkdir(targetDiskDir, { recursive: true });

  const ext = path.extname(originalName) || path.extname(fileName) || ".pdf";
  const baseName = "Reprovado-" + rejectedContractDateStamp();
  let targetName = baseName + ext;
  let targetDiskPath = path.join(targetDiskDir, targetName);
  for (let index = 1; ; index += 1) {
    try {
      await fs.access(targetDiskPath);
      targetName = baseName + "_" + index + ext;
      targetDiskPath = path.join(targetDiskDir, targetName);
    } catch {
      break;
    }
  }

  try {
    await fs.rename(sourceDiskPath, targetDiskPath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    await fs.copyFile(sourceDiskPath, targetDiskPath);
    await fs.unlink(sourceDiskPath);
  }

  return {
    relativeDir: targetRelativeDir,
    fileName: targetName,
    storedPath: (targetRelativeDir + "/" + targetName).replace(/\\/g, "/"),
  };
}

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
    const contratoStatus = meta.statusCol
      ? String(row[meta.statusCol] || "").trim().toLowerCase()
      : "";
    const contratoReprovado = contratoStatus === "reprovado";
    const contratoId = meta.idCol ? row[meta.idCol] : null;
    const docsCheck = contratoId
      ? await checkAllDocsConferidosByContratoId(req, contratoId)
      : { ok: false, total: 0, pendentes: 0, reprovados: 0 };

    const documentosAprovados = Boolean(docsCheck.ok);
    const contratoAprovado = contratoStatus
      ? contratoStatus === "aprovado"
      : conferido;
    const contratoValido = Boolean(
      arquivoExiste && contratoAprovado && documentosAprovados && !contratoReprovado,
    );

    return res.json({
      status: "sucesso",
      contrato: {
        nomeArquivo: nomeArquivo || null,
        filePath: filePath || null,
      },
      possuiContratoDb: true,
      arquivoExiste,
      conferido: contratoAprovado,
      contratoStatus: contratoStatus || (contratoAprovado ? "aprovado" : "pendente"),
      contratoReprovado,
      motivoReprovacao: meta.motivoReprovacaoCol
        ? String(row[meta.motivoReprovacaoCol] || "")
        : "",
      documentosAprovados,
      documentosPendentes: docsCheck.pendentes || 0,
      documentosReprovados: docsCheck.reprovados || 0,
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
        .json({ status: "erro", mensagem: "Usuario nao identificado" });
    }

    const contratoId = Number(req.params.contratoId);
    if (!Number.isInteger(contratoId) || contratoId <= 0) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "contratoId invalido" });
    }

    const meta = await getContratosTableMeta(req);
    if (!meta.exists || !meta.idCol) {
      return res.status(500).json({
        status: "erro",
        mensagem: `Tabela ${TABLE_NAMES.contratos} nao esta pronta.`,
      });
    }

    if (!meta.statusCol) {
      return res.status(500).json({
        status: "erro",
        mensagem: `Coluna Status ausente em ${TABLE_NAMES.contratos}.`,
      });
    }

    const selectParts = [`${qcol(meta.idCol)} AS id`];
    if (meta.filePathCol) selectParts.push(`${qcol(meta.filePathCol)} AS filePath`);
    if (meta.nomeArquivoCol) selectParts.push(`${qcol(meta.nomeArquivoCol)} AS nomeArquivo`);

    const [existingRows] = await dbFor(req).query(
      `
        SELECT ${selectParts.join(", ")}
        FROM ${qtable(meta.tableName)}
        WHERE ${qcol(meta.idCol)} = ?
        LIMIT 1
      `,
      [contratoId],
    );

    if (!existingRows || !existingRows.length) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Contrato nao encontrado" });
    }

    const docsCheck = await checkAllDocsConferidosByContratoId(req, contratoId);
    if (!docsCheck.ok) {
      const mensagem =
        docsCheck.reason === "metadata_missing"
          ? `Tabela ${TABLE_NAMES.documentos} sem coluna Status para validar os documentos.`
          : docsCheck.reason === "no_documents"
            ? "Nao ha documentos vinculados para conferir este contrato."
            : docsCheck.reason === "rejected_documents"
              ? "Existem documentos reprovados. O cliente precisa reenviar os documentos antes da aprovacao do contrato."
              : `Ainda existem ${docsCheck.pendentes} documento(s) sem conferencia.`;
      return res.status(409).json({ status: "erro", mensagem });
    }

    const updateParts = [`${qcol(meta.statusCol)} = ?`];
    const updateParams = ["aprovado"];
    if (meta.motivoReprovacaoCol) {
      updateParts.push(`${qcol(meta.motivoReprovacaoCol)} = NULL`);
    }
    if (meta.conferidoAtCol) {
      updateParts.push(`${qcol(meta.conferidoAtCol)} = NOW()`);
    }
    if (meta.conferidoPorCol) {
      updateParts.push(`${qcol(meta.conferidoPorCol)} = ?`);
      updateParams.push(login);
    }
    updateParams.push(contratoId);

    await dbFor(req).query(
      `UPDATE ${qtable(meta.tableName)}
          SET ${updateParts.join(",\n              ")}
        WHERE ${qcol(meta.idCol)} = ?`,
      updateParams,
    );

    return res.json({
      status: "sucesso",
      mensagem: "Contrato conferido com sucesso.",
      contrato: {
        id: contratoId,
        status: "aprovado",
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

router.post("/contratos/:contratoId/reprovar", async (req, res) => {
  try {
    const login = getReqLogin(req);
    if (!login) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "Usuario nao identificado" });
    }

    const contratoId = Number(req.params.contratoId);
    if (!Number.isInteger(contratoId) || contratoId <= 0) {
      return res
        .status(400)
        .json({ status: "erro", mensagem: "contratoId invalido" });
    }

    const motivoReprovacao = String(req.body?.motivoReprovacao || "").trim();
    if (!motivoReprovacao) {
      return res.status(400).json({
        status: "erro",
        mensagem: "Informe o motivo da reprovacao.",
      });
    }

    const meta = await getContratosTableMeta(req);
    if (!meta.exists || !meta.idCol) {
      return res.status(500).json({
        status: "erro",
        mensagem: `Tabela ${TABLE_NAMES.contratos} nao esta pronta.`,
      });
    }

    if (!meta.statusCol) {
      return res.status(500).json({
        status: "erro",
        mensagem: `Coluna Status ausente em ${TABLE_NAMES.contratos}.`,
      });
    }

    if (!meta.motivoReprovacaoCol) {
      return res.status(500).json({
        status: "erro",
        mensagem: `Coluna motivo_reprovacao ausente em ${TABLE_NAMES.contratos}. Execute o schema principal create_melpethostel_schema.sql.`,
      });
    }

    const selectParts = [`${qcol(meta.idCol)} AS id`];
    if (meta.filePathCol) selectParts.push(`${qcol(meta.filePathCol)} AS filePath`);
    if (meta.nomeArquivoCol) selectParts.push(`${qcol(meta.nomeArquivoCol)} AS nomeArquivo`);

    const [existingRows] = await dbFor(req).query(
      `
        SELECT ${selectParts.join(", ")}
        FROM ${qtable(meta.tableName)}
        WHERE ${qcol(meta.idCol)} = ?
        LIMIT 1
      `,
      [contratoId],
    );

    if (!existingRows || !existingRows.length) {
      return res
        .status(404)
        .json({ status: "erro", mensagem: "Contrato nao encontrado" });
    }

    const movedRejectedContract = meta.filePathCol
      ? await moveRejectedContractFile(existingRows[0]?.filePath, existingRows[0]?.nomeArquivo)
      : null;

    const updateParts = [`${qcol(meta.statusCol)} = ?`];
    const updateParams = ["reprovado"];
    if (movedRejectedContract && meta.filePathCol) {
      updateParts.push(`${qcol(meta.filePathCol)} = ?`);
      updateParams.push(meta.nomeArquivoCol ? movedRejectedContract.relativeDir : movedRejectedContract.storedPath);
    }
    if (movedRejectedContract && meta.nomeArquivoCol) {
      updateParts.push(`${qcol(meta.nomeArquivoCol)} = ?`);
      updateParams.push(movedRejectedContract.fileName);
    }
    if (meta.motivoReprovacaoCol) {
      updateParts.push(`${qcol(meta.motivoReprovacaoCol)} = ?`);
      updateParams.push(motivoReprovacao);
    }
    if (meta.conferidoAtCol) {
      updateParts.push(`${qcol(meta.conferidoAtCol)} = NOW()`);
    }
    if (meta.conferidoPorCol) {
      updateParts.push(`${qcol(meta.conferidoPorCol)} = ?`);
      updateParams.push(login);
    }
    updateParams.push(contratoId);

    await dbFor(req).query(
      `UPDATE ${qtable(meta.tableName)}
          SET ${updateParts.join(",\n              ")}
        WHERE ${qcol(meta.idCol)} = ?`,
      updateParams,
    );

    return res.json({
      status: "sucesso",
      mensagem: "Contrato reprovado com sucesso.",
      contrato: {
        id: contratoId,
        status: "reprovado",
        motivoReprovacao,
        conferido: false,
        conferidoPor: login,
        filePath: movedRejectedContract?.storedPath || null,
      },
    });
  } catch (error) {
    console.error(
      "Error in POST /melpethostel/contratos/:contratoId/reprovar:",
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
      const userDirData = await ensureUserDocumentStorage(req, login);
      if (!userDirData) {
        return res.status(400).json({
          status: "erro",
          mensagem: "Usuário sem grupo configurado para salvar contrato.",
        });
      }

      const { relativeDir, safeUsuario } = userDirData;
      const diskDir = resolveUploadsDirToDisk(relativeDir);

      const finalFileName = `${safeUsuario}_Contrato_Assinado.pdf`;
      const fullPath = path.join(diskDir, finalFileName);
      await fs.writeFile(fullPath, req.file.buffer);

      if (existingRow && meta.idCol) {
        const setParts = [
          `${qcol(meta.nomeArquivoCol)} = ?`,
          `${qcol(meta.filePathCol)} = ?`,
        ];
        const params = [finalFileName, relativeDir];


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

      getUsuarioByLogin(req, login)
        .catch((error) => {
          console.error(
            "Erro ao carregar usuário para notificação de contrato:",
            error?.message || error,
          );
          return null;
        })
        .then((usuario) =>
          notifyDocumentUploadForReview(req, {
            usuario,
            login,
            documentNames: ["Contrato Assinado"],
          }),
        )
        .catch((error) => {
          console.error(
            "Erro ao enviar aviso de contrato no Telegram:",
            error?.message || error,
          );
        });

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
