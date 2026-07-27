import { useEffect, useRef, useState } from "react";
import { Button, ContractModal, Modal, PdfViewer } from "../../components";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import api, { API_URL } from "../../services/api";
import "./styles.css";

const SUPPORT_DOC_FIELDS = [
  {
    key: "identificacao",
    label: "Documento de identificacao",
    tipoNome: "Documento de Identificacao",
    required: true,
  },
  {
    key: "comprovante",
    label: "Comprovante de endereco",
    tipoNome: "Comprovante de Endereço",
    required: true,
  },
  {
    key: "outros",
    label: "Outros Documentos",
    tipoNome: "Outros Documentos",
    required: false,
  },
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export default function MelPetHostel({ onBack }) {
  const { usuario } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef(null);
  const supportFileRefs = useRef({});
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [contractStatus, setContractStatus] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedSupportFiles, setSelectedSupportFiles] = useState({
    identificacao: null,
    comprovante: null,
    outros: null,
  });
  const [documentTypeIds, setDocumentTypeIds] = useState({
    identificacao: null,
    comprovante: null,
    outros: null,
  });
  const [documentStatusByKey, setDocumentStatusByKey] = useState({
    identificacao: { existsDb: false, existsDisk: false, identifiedCount: 0 },
    comprovante: { existsDb: false, existsDisk: false, identifiedCount: 0 },
    outros: { existsDb: false, existsDisk: false, identifiedCount: 0 },
  });
  const [uploading, setUploading] = useState(false);
  const [uploadingSupportKey, setUploadingSupportKey] = useState("");
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const [activeMenu, setActiveMenu] = useState("");
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loadingPendingUsers, setLoadingPendingUsers] = useState(false);
  const [pendingUsersError, setPendingUsersError] = useState("");
  const [selectedPendingUser, setSelectedPendingUser] = useState(null);
  const [selectedUserFiles, setSelectedUserFiles] = useState([]);
  const [loadingSelectedUserFiles, setLoadingSelectedUserFiles] =
    useState(false);
  const [selectedUserFilesError, setSelectedUserFilesError] = useState("");
  const [conferindoItemKey, setConferindoItemKey] = useState("");
  const [documentPreviewOpen, setDocumentPreviewOpen] = useState(false);
  const [documentPreviewTitle, setDocumentPreviewTitle] = useState("");
  const [documentPreviewSrc, setDocumentPreviewSrc] = useState("");

  const usuarioGrupo =
    (usuario && (usuario.grupoNome || usuario.grupo)) || null;
  const isAdmin = Boolean(
    usuario &&
    (usuario.admin ||
      usuario.isAdmin ||
      (usuario.perfil && String(usuario.perfil).toLowerCase() === "admin") ||
      (usuarioGrupo && String(usuarioGrupo).toLowerCase().includes("admin"))),
  );

  const contratoValido = Boolean(contractStatus?.contratoValido);
  const acessoDiretoMenu = isAdmin || contratoValido;
  const contratoDetectado = Boolean(
    contractStatus?.possuiContratoDb && contractStatus?.arquivoExiste,
  );
  const actionButtonsDisabled = contratoDetectado || uploading;
  const shouldShowSupportDocsCard = Boolean(
    !isAdmin && !loadingStatus && !statusError && !contratoValido,
  );

  const requiredDocKeys = SUPPORT_DOC_FIELDS.filter((d) => d.required).map(
    (d) => d.key,
  );
  const requiredDocsComplete = requiredDocKeys.every(
    (key) =>
      documentStatusByKey[key]?.existsDb &&
      documentStatusByKey[key]?.existsDisk,
  );

  const pendingMissingLabels = [
    ...(contratoDetectado ? [] : ["Contrato assinado"]),
    ...SUPPORT_DOC_FIELDS.filter((d) => d.required)
      .filter(
        (d) =>
          !(
            documentStatusByKey[d.key]?.existsDb &&
            documentStatusByKey[d.key]?.existsDisk
          ),
      )
      .map((d) => d.label),
  ];

  async function loadContractStatus() {
    setLoadingStatus(true);
    setStatusError("");
    try {
      const data = await api.get("/melpethostel/contratos/status");
      setContractStatus(data || null);
    } catch (error) {
      console.error("Erro ao verificar contrato do Mel Pet Hostel:", error);
      setStatusError(
        error?.message || "Falha ao verificar status do contrato.",
      );
    } finally {
      setLoadingStatus(false);
    }
  }

  async function loadDocumentTypes() {
    try {
      const data = await api.get("/melpethostel/documentos/tipos");
      const tipos = Array.isArray(data?.tipos) ? data.tipos : [];

      const nextIds = { identificacao: null, comprovante: null, outros: null };

      for (const field of SUPPORT_DOC_FIELDS) {
        const target = normalizeText(field.tipoNome);
        const found = tipos.find(
          (t) => normalizeText(t?.Documento_Tipo) === target,
        );
        nextIds[field.key] = found?.Id || null;
      }

      setDocumentTypeIds(nextIds);
    } catch (error) {
      console.error("Erro ao carregar tipos de documentos:", error);
      showToast("Não foi possível carregar os tipos de documentos.", "error");
    }
  }

  async function loadDocumentStatus() {
    try {
      const data = await api.get("/melpethostel/documentos/status");
      const docs = Array.isArray(data?.documentos) ? data.documentos : [];

      const nextStatus = {
        identificacao: {
          existsDb: false,
          existsDisk: false,
          identifiedCount: 0,
        },
        comprovante: { existsDb: false, existsDisk: false, identifiedCount: 0 },
        outros: { existsDb: false, existsDisk: false, identifiedCount: 0 },
      };

      for (const doc of docs) {
        const key = doc?.key;
        if (key && Object.prototype.hasOwnProperty.call(nextStatus, key)) {
          nextStatus[key] = {
            existsDb: Boolean(doc.existsDb),
            existsDisk: Boolean(doc.existsDisk),
            identifiedCount: Number(doc.identifiedCount) || 0,
          };
        }
      }

      setDocumentStatusByKey(nextStatus);
    } catch (error) {
      console.error("Erro ao carregar status dos documentos:", error);
    }
  }

  async function loadPendingValidationUsers() {
    setLoadingPendingUsers(true);
    setPendingUsersError("");
    try {
      const data = await api.get("/melpethostel/documentos/pendentes");
      const users = Array.isArray(data?.usuarios) ? data.usuarios : [];
      setPendingUsers(users);
    } catch (error) {
      console.error("Erro ao carregar usuários pendentes:", error);
      setPendingUsers([]);
      setPendingUsersError(
        error?.message || "Não foi possível carregar os usuários pendentes.",
      );
    } finally {
      setLoadingPendingUsers(false);
    }
  }

  async function loadSelectedUserFiles(user) {
    if (!user?.usuarioId) return;
    setLoadingSelectedUserFiles(true);
    setSelectedUserFilesError("");
    try {
      const data = await api.get(
        `/melpethostel/documentos/usuario/${encodeURIComponent(user.usuarioId)}/arquivos`,
      );
      const files = Array.isArray(data?.arquivos) ? data.arquivos : [];
      setSelectedUserFiles(files);
      if (data?.usuario?.nome) {
        setSelectedPendingUser((prev) => ({
          ...(prev || user),
          nome: data.usuario.nome,
          usuarioId: data.usuario.id || user.usuarioId,
          contratoId: data?.contratoId || (prev && prev.contratoId) || null,
        }));
      }
    } catch (error) {
      console.error("Erro ao carregar documentos do usuário:", error);
      setSelectedUserFiles([]);
      setSelectedUserFilesError(
        error?.message || "Não foi possível carregar os documentos.",
      );
    } finally {
      setLoadingSelectedUserFiles(false);
    }
  }

  function handleOpenUserDocuments(user) {
    const sameUserOpen =
      selectedPendingUser &&
      String(selectedPendingUser.usuarioId || "") ===
        String(user?.usuarioId || "");

    if (sameUserOpen) {
      handleCloseUserDocuments();
      return;
    }

    setSelectedPendingUser(user);
    setSelectedUserFiles([]);
    setSelectedUserFilesError("");
    loadSelectedUserFiles(user);
  }

  function handleCloseUserDocuments() {
    setSelectedPendingUser(null);
    setSelectedUserFiles([]);
    setSelectedUserFilesError("");
  }

  function handleOpenDocumentPreview(file) {
    const url = buildFileUrl(file?.fileUrl);
    if (!url) return;
    setDocumentPreviewTitle(
      `${file?.nomeDocumento || "Documento"} - ${file?.tipoDocumento || "Arquivo"}`,
    );
    setDocumentPreviewSrc(url);
    setDocumentPreviewOpen(true);
  }

  function handleCloseDocumentPreview() {
    setDocumentPreviewOpen(false);
    setDocumentPreviewTitle("");
    setDocumentPreviewSrc("");
  }

  function buildConferirKey(file) {
    if (file?.tipoRegistro === "contrato") {
      return `contrato-${Number(file?.contratoId) || 0}`;
    }
    return `documento-${Number(file?.documentoId) || 0}`;
  }

  async function handleConferirDocumento(file) {
    const isContrato = file?.tipoRegistro === "contrato";
    const targetId = isContrato
      ? Number(file?.contratoId)
      : Number(file?.documentoId);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      showToast("Este item não pode ser conferido.", "error");
      return;
    }

    if (file?.conferido) {
      showToast("Documento já está conferido.", "info");
      return;
    }

    try {
      const conferirKey = buildConferirKey(file);
      setConferindoItemKey(conferirKey);
      if (isContrato) {
        await api.post(`/melpethostel/contratos/${targetId}/conferir`, {});
      } else {
        await api.post(`/melpethostel/documentos/${targetId}/conferir`, {});
      }
      showToast(
        isContrato
          ? "Contrato conferido com sucesso."
          : "Documento conferido com sucesso.",
        "success",
      );

      setSelectedUserFiles((prev) =>
        (prev || []).map((item) =>
          buildConferirKey(item) === conferirKey
            ? {
                ...item,
                conferido: true,
                conferidoAt: new Date().toISOString(),
                conferidoPor: usuario?.login || item?.conferidoPor || null,
              }
            : item,
        ),
      );

      if (isContrato && selectedPendingUser?.usuarioId) {
        setPendingUsers((prev) =>
          (prev || []).filter(
            (item) =>
              String(item?.usuarioId || "") !==
              String(selectedPendingUser.usuarioId || ""),
          ),
        );
        handleCloseUserDocuments();
      }
    } catch (error) {
      console.error("Erro ao conferir documento:", error);
      showToast(error?.message || "Não foi possível conferir.", "error");
    } finally {
      setConferindoItemKey("");
    }
  }

  function buildFileUrl(fileUrl) {
    const raw = String(fileUrl || "").trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    const base = String(API_URL).replace(/\/+$/, "");
    return `${base}${raw.startsWith("/") ? raw : `/${raw}`}`;
  }

  useEffect(() => {
    if (isAdmin) {
      setLoadingStatus(false);
      setStatusError("");
      return;
    }

    (async () => {
      try {
        await api.post("/melpethostel/acesso", {});
      } catch (err) {
        console.debug("Could not notify module access:", err?.message || err);
      } finally {
        loadContractStatus();
        loadDocumentTypes();
        loadDocumentStatus();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    if (activeMenu !== "conferirDocumentos") return;
    loadPendingValidationUsers();
  }, [isAdmin, activeMenu]);

  function openFilePicker() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  function handleFileSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (
      !String(file.name || "")
        .toLowerCase()
        .endsWith(".pdf")
    ) {
      showToast("Selecione um arquivo PDF.", "error");
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  }

  function openSupportFilePicker(key) {
    const input = supportFileRefs.current[key];
    if (!input) return;
    input.value = "";
    input.click();
  }

  function handleSupportFileSelected(key, event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (
      !String(file.name || "")
        .toLowerCase()
        .endsWith(".pdf")
    ) {
      showToast("Selecione um arquivo PDF.", "error");
      setSelectedSupportFiles((prev) => ({ ...prev, [key]: null }));
      return;
    }

    setSelectedSupportFiles((prev) => ({ ...prev, [key]: file }));
  }

  async function handleUploadContrato() {
    if (!selectedFile || uploading) return;

    setUploading(true);
    try {
      const token = localStorage.getItem("token");
      const savedUser = localStorage.getItem("usuario");
      let login = null;
      try {
        login = savedUser ? JSON.parse(savedUser)?.login : null;
      } catch {
        login = null;
      }

      const formData = new FormData();
      formData.append("arquivo", selectedFile);

      const response = await fetch(
        `${String(API_URL).replace(/\/+$/, "")}/melpethostel/contratos/upload`,
        {
          method: "POST",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(login ? { "x-user": login } : {}),
          },
          body: formData,
        },
      );

      const data = await response.json();
      if (!response.ok || data?.status === "erro") {
        throw new Error(data?.mensagem || "Falha no upload do contrato");
      }

      setSelectedFile(null);
      showToast("Contrato enviado com sucesso.", "success");
      await loadContractStatus();
      await loadDocumentStatus();
    } catch (error) {
      console.error("Erro ao enviar contrato assinado:", error);
      showToast(
        error?.message || "Não foi possível enviar o contrato.",
        "error",
      );
    } finally {
      setUploading(false);
    }
  }

  function handleContractPrimaryAction() {
    if (selectedFile) {
      handleUploadContrato();
      return;
    }
    openFilePicker();
  }

  async function handleUploadSupportDoc(key) {
    const file = selectedSupportFiles[key];
    if (!file || uploadingSupportKey) return;

    const tipoId = documentTypeIds[key];
    if (!tipoId) {
      showToast(
        "Tipo de documento não configurado. Verifique MelPetHostel_Documentos_Tipos.",
        "error",
      );
      return;
    }

    setUploadingSupportKey(key);
    try {
      const token = localStorage.getItem("token");
      const savedUser = localStorage.getItem("usuario");
      let login = null;
      try {
        login = savedUser ? JSON.parse(savedUser)?.login : null;
      } catch {
        login = null;
      }

      const formData = new FormData();
      formData.append("arquivo", file);
      formData.append("tipoId", String(tipoId));

      const response = await fetch(
        `${String(API_URL).replace(/\/+$/, "")}/melpethostel/documentos/upload`,
        {
          method: "POST",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(login ? { "x-user": login } : {}),
          },
          body: formData,
        },
      );

      const data = await response.json();
      if (!response.ok || data?.status === "erro") {
        throw new Error(data?.mensagem || "Falha no upload do documento");
      }

      setSelectedSupportFiles((prev) => ({ ...prev, [key]: null }));
      showToast("Documento enviado com sucesso.", "success");
      await loadDocumentStatus();
    } catch (error) {
      console.error("Erro ao enviar documento complementar:", error);
      showToast(
        error?.message || "Não foi possível enviar o documento.",
        "error",
      );
    } finally {
      setUploadingSupportKey("");
    }
  }

  function handleSupportPrimaryAction(key) {
    const fieldMeta = SUPPORT_DOC_FIELDS.find((d) => d.key === key);
    const isRequired = Boolean(fieldMeta?.required);
    const isConcluded =
      documentStatusByKey[key]?.existsDb &&
      documentStatusByKey[key]?.existsDisk;

    if (isRequired && isConcluded) {
      return;
    }

    if (selectedSupportFiles[key]) {
      handleUploadSupportDoc(key);
      return;
    }
    openSupportFilePicker(key);
  }

  return (
    <div className="page-page melpet-shell">
      <header className="page-header melpet-header melpet-title-card">
        <h1>Sistema Mel Pet Hostel</h1>
      </header>

      <main className="page-content melpet-content">
        {loadingStatus ? (
          <section className="melpet-panel">
            <p>Verificando contrato do usuário...</p>
          </section>
        ) : statusError ? (
          <section className="melpet-panel">
            <p className="melpet-error">{statusError}</p>
          </section>
        ) : acessoDiretoMenu ? (
          <>
            <section className="melpet-menu-surface">
              <h2>Menu do Mel Pet Hostel</h2>

              <div className="melpet-menu">
                {isAdmin ? (
                  <>
                    <div className="menu-row">
                      <button
                        className="menu-button"
                        type="button"
                        onClick={() => {
                          setActiveMenu((prev) =>
                            prev === "conferirDocumentos"
                              ? ""
                              : "conferirDocumentos",
                          );
                          setOpenMenu(null);
                          setSelectedPendingUser(null);
                          setSelectedUserFiles([]);
                          setSelectedUserFilesError("");
                        }}
                      >
                        <span>Conferir Documentos</span>
                      </button>
                    </div>

                    <div className="menu-row">
                      <button
                        className="menu-button"
                        onClick={() =>
                          setOpenMenu((prev) =>
                            prev === "controlePlanos" ? null : "controlePlanos",
                          )
                        }
                        aria-expanded={openMenu === "controlePlanos"}
                      >
                        <span>Controle de Planos</span>
                        <span
                          className={`chev ${openMenu === "controlePlanos" ? "open" : ""}`}
                        >
                          ▾
                        </span>
                      </button>
                    </div>

                    <div
                      className={`menu-panel ${openMenu === "controlePlanos" ? "open" : ""}`}
                    >
                      <div className="menu-panel-inner">
                        <button
                          type="button"
                          className="menu-item"
                          onClick={() => setActiveMenu("controlePlanos")}
                        >
                          Acessar
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="menu-row">
                    <button
                      className="menu-button"
                      type="button"
                      onClick={() => {
                        setActiveMenu((prev) =>
                          prev === "cadastrarPet" ? "" : "cadastrarPet",
                        );
                        setOpenMenu(null);
                      }}
                    >
                      <span>Cadastrar Pet</span>
                    </button>
                  </div>
                )}
              </div>
            </section>

            {isAdmin && activeMenu === "conferirDocumentos" ? (
              <section className="melpet-menu-content">
                <div className="melpet-outer-card melpet-validate-card">
                  <div className="melpet-outer-card-header">
                    <h3>Conferir Documentos</h3>
                  </div>

                  <div className="melpet-categories-card">
                    <div className="melpet-card-body">
                      <p className="melpet-validate-subtitle">
                        Usuários com documentos pendentes de conferência:
                      </p>
                      {loadingPendingUsers ? (
                        <p className="melpet-validate-message">
                          Carregando usuários...
                        </p>
                      ) : pendingUsersError ? (
                        <p className="melpet-error">{pendingUsersError}</p>
                      ) : pendingUsers.length ? (
                        <ul className="melpet-pending-users-list">
                          {pendingUsers.map((u) => (
                            <li key={u.usuarioId || u.nome}>
                              <button
                                type="button"
                                className="melpet-pending-user-btn"
                                onClick={() => handleOpenUserDocuments(u)}
                              >
                                {u.nome}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="melpet-validate-message">
                          Nenhum usuário com documentos pendentes no momento.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {selectedPendingUser ? (
                  <div className="melpet-outer-card melpet-user-docs-container">
                    <div className="melpet-outer-card-header">
                      <h3>
                        Documentos de {selectedPendingUser?.nome || "usuário"}
                      </h3>
                    </div>

                    <div className="melpet-categories-card melpet-docs-card-shell">
                      <div className="melpet-card-body melpet-docs-card-body">
                        {loadingSelectedUserFiles ? (
                          <p className="melpet-validate-message">
                            Carregando documentos...
                          </p>
                        ) : selectedUserFilesError ? (
                          <p className="melpet-error">
                            {selectedUserFilesError}
                          </p>
                        ) : (
                          <div className="melpet-docs-table-wrap">
                            <table className="melpet-docs-table">
                              <thead>
                                <tr>
                                  <th>Nome do documento</th>
                                  <th>Tipo de documento</th>
                                  <th>Visualizar</th>
                                  <th>Conferir</th>
                                  <th>Reprovar</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedUserFiles.length ? (
                                  (() => {
                                    const documentosDoUsuario =
                                      selectedUserFiles.filter(
                                        (item) =>
                                          item?.tipoRegistro === "documento",
                                      );
                                    const allDocsConferidos =
                                      documentosDoUsuario.length > 0 &&
                                      documentosDoUsuario.every((item) =>
                                        Boolean(item?.conferido),
                                      );

                                    return selectedUserFiles.map(
                                      (file, index) => {
                                        const url = buildFileUrl(file.fileUrl);
                                        const isConferido = Boolean(
                                          file?.conferido,
                                        );
                                        const isConferindo =
                                          buildConferirKey(file) ===
                                          conferindoItemKey;
                                        const hasConferirTarget =
                                          file?.tipoRegistro === "contrato"
                                            ? Number(file?.contratoId) > 0 &&
                                              allDocsConferidos
                                            : Number(file?.documentoId) > 0;
                                        return (
                                          <tr
                                            key={`${file.filePath || file.nomeDocumento}-${index}`}
                                          >
                                            <td>{file.nomeDocumento}</td>
                                            <td>{file.tipoDocumento}</td>
                                            <td>
                                              <button
                                                type="button"
                                                className="melpet-view-doc-btn"
                                                disabled={!url}
                                                onClick={() =>
                                                  handleOpenDocumentPreview(
                                                    file,
                                                  )
                                                }
                                              >
                                                Visualizar documento
                                              </button>
                                            </td>
                                            <td>
                                              <button
                                                type="button"
                                                className="melpet-review-btn melpet-review-btn--approve"
                                                disabled={
                                                  isConferido ||
                                                  isConferindo ||
                                                  !hasConferirTarget
                                                }
                                                onClick={() =>
                                                  handleConferirDocumento(file)
                                                }
                                              >
                                                {isConferindo
                                                  ? "Conferindo..."
                                                  : isConferido
                                                    ? "Conferido"
                                                    : "Conferir"}
                                              </button>
                                            </td>
                                            <td>
                                              <button
                                                type="button"
                                                className="melpet-review-btn melpet-review-btn--reject"
                                                onClick={() =>
                                                  showToast(
                                                    "Reprovação ainda não integrada.",
                                                    "info",
                                                  )
                                                }
                                              >
                                                Reprovar
                                              </button>
                                            </td>
                                          </tr>
                                        );
                                      },
                                    );
                                  })()
                                ) : (
                                  <tr>
                                    <td colSpan={5}>
                                      Nenhum documento encontrado.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="melpet-user-docs-actions">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCloseUserDocuments}
                      >
                        Fechar
                      </Button>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : isAdmin && activeMenu === "controlePlanos" ? (
              <section className="melpet-menu-content">
                <p>
                  Área de controle de planos. Aqui você poderá gerenciar planos
                  e ajustes do módulo.
                </p>
              </section>
            ) : !isAdmin && activeMenu === "cadastrarPet" ? (
              <section className="melpet-menu-content">
                <p>Área de cadastro de pet.</p>
              </section>
            ) : null}
          </>
        ) : (
          <section className="melpet-panel melpet-contract-gate">
            {contratoDetectado && requiredDocsComplete ? (
              <p>
                Localizamos seu contrato assinado, mas ainda nao foi conferido
                pela nossa equipe. Aguarde a conferencia para desbloquear o
                menu.
              </p>
            ) : (
              <>
                {pendingMissingLabels.map((label) => (
                  <p key={label} className="melpet-contract-missing">
                    {label} ainda nao enviado. Para podermos conferir seus
                    documentos, clique em upload e envie os documentos
                    faltantes.
                  </p>
                ))}
              </>
            )}

            <div className="melpet-contract-actions">
              <Button
                type="button"
                onClick={handleContractPrimaryAction}
                disabled={actionButtonsDisabled}
              >
                {uploading
                  ? "Enviando..."
                  : selectedFile
                    ? "Enviar"
                    : "Upload do contrato"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setContractModalOpen(true)}
                disabled={actionButtonsDisabled}
              >
                Preencher Contrato
              </Button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="melpet-file-input-hidden"
              onChange={handleFileSelected}
            />

            {selectedFile ? (
              <div className="melpet-selected-file-block">
                <p className="melpet-selected-file-name">
                  <span className="melpet-selected-file-label">
                    Arquivo selecionado:
                  </span>
                  <span className="melpet-selected-file-value">
                    {selectedFile.name}
                    <button
                      type="button"
                      className="melpet-clear-file-btn"
                      onClick={() => setSelectedFile(null)}
                      aria-label="Excluir seleção de arquivo"
                      title="Excluir seleção"
                      disabled={actionButtonsDisabled}
                    >
                      X
                    </button>
                  </span>
                </p>
              </div>
            ) : null}
          </section>
        )}

        {shouldShowSupportDocsCard ? (
          <section className="melpet-panel melpet-support-docs-card">
            {SUPPORT_DOC_FIELDS.map((field) => {
              const selectedSupportFile = selectedSupportFiles[field.key];
              const isUploadingThis = uploadingSupportKey === field.key;
              const isConcluded =
                documentStatusByKey[field.key]?.existsDb &&
                documentStatusByKey[field.key]?.existsDisk;
              const identifiedCount =
                documentStatusByKey[field.key]?.identifiedCount || 0;
              const supportActionDisabled =
                Boolean(uploadingSupportKey) || (field.required && isConcluded);
              return (
                <div key={field.key} className="melpet-support-doc-item">
                  <p className="melpet-support-doc-title">
                    {field.required ? (
                      <>
                        {field.label}:{" "}
                        <span
                          className={
                            isConcluded
                              ? "melpet-doc-status melpet-doc-status--done"
                              : "melpet-doc-status melpet-doc-status--pending"
                          }
                        >
                          {isConcluded ? "Concluido" : "Pendente"}
                        </span>
                      </>
                    ) : (
                      <>
                        {field.label}: {identifiedCount} identificado
                        {identifiedCount === 1 ? "" : "s"}
                      </>
                    )}
                  </p>
                  <Button
                    type="button"
                    onClick={() => handleSupportPrimaryAction(field.key)}
                    disabled={supportActionDisabled}
                  >
                    {isUploadingThis
                      ? "Enviando..."
                      : selectedSupportFile
                        ? "Enviar"
                        : "Upload"}
                  </Button>

                  <input
                    ref={(el) => {
                      supportFileRefs.current[field.key] = el;
                    }}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="melpet-file-input-hidden"
                    onChange={(event) =>
                      handleSupportFileSelected(field.key, event)
                    }
                  />

                  {selectedSupportFile ? (
                    <div className="melpet-selected-file-block">
                      <p className="melpet-selected-file-name">
                        <span className="melpet-selected-file-label">
                          Arquivo selecionado:
                        </span>
                        <span className="melpet-selected-file-value">
                          {selectedSupportFile.name}
                          <button
                            type="button"
                            className="melpet-clear-file-btn"
                            onClick={() =>
                              setSelectedSupportFiles((prev) => ({
                                ...prev,
                                [field.key]: null,
                              }))
                            }
                            aria-label="Excluir seleção de arquivo"
                            title="Excluir seleção"
                            disabled={supportActionDisabled}
                          >
                            X
                          </button>
                        </span>
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        ) : null}

        {onBack ? (
          <div className="mt-md melpet-footer-actions">
            <Button variant="outline" onClick={onBack}>
              Voltar
            </Button>
          </div>
        ) : null}
      </main>

      <ContractModal
        isOpen={contractModalOpen}
        onClose={() => setContractModalOpen(false)}
        onGovBrSign={async () => {
          setContractModalOpen(false);
          await loadContractStatus();
        }}
      />

      <Modal
        isOpen={documentPreviewOpen}
        onClose={handleCloseDocumentPreview}
        title={documentPreviewTitle || "Visualizar documento"}
        containerStyle={{ width: "min(96%, 1100px)", maxWidth: 1100 }}
        contentStyle={{ padding: 0 }}
      >
        <div className="melpet-preview-modal-body">
          <PdfViewer src={documentPreviewSrc} title={documentPreviewTitle} />
        </div>
      </Modal>
    </div>
  );
}
