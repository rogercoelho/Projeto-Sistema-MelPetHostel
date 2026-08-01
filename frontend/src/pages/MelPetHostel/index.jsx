import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  ContractModal,
  MenuItem,
  MenuList,
  MenuPanel,
  MenuTemplate,
  Modal,
  PdfViewer,
} from "../../components";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import api, { API_URL } from "../../services/api";
import { buildContractorDataFromCliente } from "../../utils/clientProfile";
import PetRegistrationForm from "./PetRegistrationForm";
import "./styles.css";

const SUPPORT_DOC_FIELDS = [
  {
    key: "identificacao",
    label: "Documento de identificação",
    tipoNome: "Documento de Identificacao",
    required: true,
  },
  {
    key: "comprovante",
    label: "Comprovante de Endereço",
    tipoNome: "Comprovante de Endereco",
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

function getSupportDocKeyFromTypeName(value) {
  const text = normalizeText(value);
  if (text.includes("identificacao") || text.includes("identidade")) {
    return "identificacao";
  }
  if (text.includes("comprovante") && text.includes("endere")) {
    return "comprovante";
  }
  if (text.includes("outro")) return "outros";
  return "";
}

function formatPetAge(value) {
  const age = String(value || "").trim();
  if (!age) return "";
  return /\bano(s)?\b/i.test(age) ? age : `${age} anos`;
}

function formatPetWeight(value) {
  const weight = String(value || "").trim();
  if (!weight) return "";
  return /\bkg\b/i.test(weight) ? weight : `${weight} kg`;
}

function getPetSummary(pet) {
  return [
    pet?.raca,
    formatPetAge(pet?.idade),
    formatPetWeight(pet?.pesoAproximado),
  ]
    .filter(Boolean)
    .join(" - ");
}

function getPetFormInitialData(pet) {
  return {
    ...(pet?.ficha || {}),
    nomePet: pet?.ficha?.nomePet || pet?.nome || "",
    raca: pet?.ficha?.raca || pet?.raca || "",
    idade: pet?.ficha?.idade || pet?.idade || "",
    pesoAproximado: pet?.ficha?.pesoAproximado || pet?.pesoAproximado || "",
  };
}

export default function MelPetHostel({
  onBack,
  clientProfile,
  clientProfileReady = true,
  clientProfilePending = false,
  enforceContractGate = false,
  petRegistrationOnly = false,
  contractPromptRequest = 0,
  onPetRegistered,
}) {
  const { usuario, logout } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef(null);
  const supportFileRefs = useRef({});
  const handledContractPromptRef = useRef(contractPromptRequest);
  const autoContractPromptedRef = useRef(false);
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
  const [uploadPanelOpen, setUploadPanelOpen] = useState(true);
  const [registeredPets, setRegisteredPets] = useState([]);
  const [loadingPets, setLoadingPets] = useState(false);
  const [petFormMode, setPetFormMode] = useState("list");
  const [selectedPet, setSelectedPet] = useState(null);
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

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const usuarioGrupo =
    (usuario && (usuario.grupoNome || usuario.grupo)) || null;
  const isAdmin = Boolean(
    usuario &&
    (usuario.admin ||
      usuario.isAdmin ||
      (usuario.perfil && String(usuario.perfil).toLowerCase() === "admin") ||
      (usuarioGrupo && String(usuarioGrupo).toLowerCase().includes("admin"))),
  );

  const shouldEnforceContractGate = Boolean(!isAdmin && enforceContractGate);
  const contratoValido = Boolean(contractStatus?.contratoValido);
  const petCadastroObrigatorio = Boolean(
    !isAdmin && contratoValido && !loadingPets && registeredPets.length === 0,
  );
  const acessoDiretoMenu =
    isAdmin ||
    !shouldEnforceContractGate ||
    (contratoValido && !petCadastroObrigatorio);
  const shouldRenderPetRegistrationDashboard = Boolean(
    !isAdmin &&
    petRegistrationOnly &&
    !loadingStatus &&
    !statusError &&
    (acessoDiretoMenu || petCadastroObrigatorio),
  );
  const shouldRenderUserPetRegistrationDashboard = Boolean(
    !petRegistrationOnly &&
    !isAdmin &&
    !loadingStatus &&
    !statusError &&
    (acessoDiretoMenu || petCadastroObrigatorio),
  );
  const contratoDetectado = Boolean(
    shouldEnforceContractGate &&
    contractStatus?.possuiContratoDb &&
    contractStatus?.arquivoExiste,
  );
  const profileGateActive = Boolean(
    shouldEnforceContractGate && (!clientProfileReady || clientProfilePending),
  );
  const actionButtonsDisabled =
    contratoDetectado || uploading || profileGateActive;
  const shouldShowSupportDocsCard = Boolean(
    !isAdmin &&
    shouldEnforceContractGate &&
    !profileGateActive &&
    !loadingStatus &&
    !statusError &&
    !contratoValido,
  );

  const requiredDocKeys = SUPPORT_DOC_FIELDS.filter((d) => d.required).map(
    (d) => d.key,
  );
  const requiredDocsComplete = requiredDocKeys.every(
    (key) =>
      documentStatusByKey[key]?.existsDb &&
      documentStatusByKey[key]?.existsDisk,
  );

  const pendingRequiredDocsCount = requiredDocKeys.filter(
    (key) =>
      !(
        documentStatusByKey[key]?.existsDb &&
        documentStatusByKey[key]?.existsDisk
      ),
  ).length;
  const pendingUploadItemsCount =
    (contratoDetectado ? 0 : 1) + pendingRequiredDocsCount;
  const uploadPanelSummary =
    contratoDetectado && requiredDocsComplete
      ? "Tudo enviado, aguardando conferencia."
      : `${pendingUploadItemsCount} item${
          pendingUploadItemsCount === 1 ? "" : "s"
        } pendente${pendingUploadItemsCount === 1 ? "" : "s"}.`;
  const firstStepComplete = Boolean(
    !contratoValido && contratoDetectado && requiredDocsComplete,
  );
  const contractorData = useMemo(
    () => buildContractorDataFromCliente(clientProfile),
    [clientProfile],
  );
  const canOpenContractPrompt = Boolean(
    !isAdmin &&
    shouldEnforceContractGate &&
    clientProfileReady &&
    !clientProfilePending &&
    !loadingStatus &&
    !statusError &&
    !contratoDetectado &&
    !contratoValido,
  );

  useEffect(() => {
    if (
      contractPromptRequest > 0 &&
      handledContractPromptRef.current !== contractPromptRequest &&
      canOpenContractPrompt
    ) {
      handledContractPromptRef.current = contractPromptRequest;
      setContractModalOpen(true);
    }
  }, [canOpenContractPrompt, contractPromptRequest]);

  useEffect(() => {
    if (!canOpenContractPrompt || autoContractPromptedRef.current) return;
    autoContractPromptedRef.current = true;
    setContractModalOpen(true);
  }, [canOpenContractPrompt]);

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

      for (const tipo of tipos) {
        const key =
          tipo?.key ||
          getSupportDocKeyFromTypeName(
            tipo?.Documento_Tipo || tipo?.documento_tipo || tipo?.nome,
          );
        if (key && Object.prototype.hasOwnProperty.call(nextIds, key)) {
          nextIds[key] = tipo?.Id || tipo?.id || null;
        }
      }

      setDocumentTypeIds(nextIds);
    } catch (error) {
      console.error("Erro ao carregar tipos de documentos:", error);
      showToast("NÃ£o foi possÃ­vel carregar os tipos de documentos.", "error");
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
      console.error("Erro ao carregar usuÃ¡rios pendentes:", error);
      setPendingUsers([]);
      setPendingUsersError(
        error?.message || "NÃ£o foi possÃ­vel carregar os usuÃ¡rios pendentes.",
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
      console.error("Erro ao carregar documentos do usuÃ¡rio:", error);
      setSelectedUserFiles([]);
      setSelectedUserFilesError(
        error?.message || "NÃ£o foi possÃ­vel carregar os documentos.",
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
      showToast("Este item nÃ£o pode ser conferido.", "error");
      return;
    }

    if (file?.conferido) {
      showToast("Documento jÃ¡ estÃ¡ conferido.", "info");
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
      showToast(error?.message || "NÃ£o foi possÃ­vel conferir.", "error");
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
    if (isAdmin || !shouldEnforceContractGate) {
      setLoadingStatus(false);
      setStatusError("");
      return;
    }

    loadContractStatus();
    loadDocumentTypes();
    loadDocumentStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, shouldEnforceContractGate]);

  useEffect(() => {
    if (!isAdmin) return;
    if (activeMenu !== "conferirDocumentos") return;
    loadPendingValidationUsers();
  }, [isAdmin, activeMenu]);

  useEffect(() => {
    if (isAdmin) return;

    let ignore = false;
    setLoadingPets(true);

    (async () => {
      try {
        const data = await api.get("/melpethostel/pets");
        if (!ignore) {
          setRegisteredPets(Array.isArray(data?.pets) ? data.pets : []);
        }
      } catch (error) {
        console.error("Erro ao carregar pets cadastrados:", error);
        if (!ignore) {
          showToast(
            error?.message ||
              "NÃ£o foi possÃ­vel carregar os pets cadastrados.",
            "error",
          );
        }
      } finally {
        if (!ignore) setLoadingPets(false);
      }
    })();

    return () => {
      ignore = true;
    };
  }, [isAdmin, showToast]);

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
        error?.message || "NÃ£o foi possÃ­vel enviar o contrato.",
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

  async function handlePetRegistrationSubmit(payload) {
    const data = await api.post("/melpethostel/pets", payload);
    const pet = data?.pet;
    const createdAt = pet?.cadastradoEm || new Date().toISOString();
    const createdPet = {
      id: pet?.id || `${createdAt}-${payload.nomePet}`,
      nome: pet?.nome || payload.nomePet,
      raca: pet?.raca || payload.raca,
      idade: pet?.idade || payload.idade,
      pesoAproximado: pet?.pesoAproximado || payload.pesoAproximado,
      cadastradoEm: createdAt,
      ficha: pet?.ficha || payload,
    };
    setRegisteredPets((current) => [createdPet, ...current]);
    setSelectedPet(null);
    setPetFormMode("list");
    onPetRegistered?.();
    showToast("Ficha do pet cadastrada com sucesso.", "success");
  }

  function handleOpenNewPetForm() {
    setSelectedPet(null);
    setPetFormMode((current) => (current === "new" ? "list" : "new"));
  }

  function handleOpenPetDetails(pet) {
    const isSamePet = selectedPet?.id === pet.id && petFormMode === "view";
    setSelectedPet(isSamePet ? null : pet);
    setPetFormMode(isSamePet ? "list" : "view");
  }

  function handleClosePetForm() {
    setSelectedPet(null);
    setPetFormMode(petCadastroObrigatorio ? "new" : "list");
  }

  function handleBackToMainMenu() {
    handleClosePetForm();
    onBack?.();
  }

  async function handleUploadSupportDoc(key) {
    const file = selectedSupportFiles[key];
    if (!file || uploadingSupportKey) return;

    const tipoId = documentTypeIds[key];
    if (!tipoId) {
      showToast(
        "Tipo de documento nao configurado. Verifique Documentos_Tipo.",
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

      const responseText = await response.text();
      let data = {};
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = {};
      }
      const fallbackErrorMessage =
        responseText && responseText.length <= 180
          ? responseText
          : "Falha no upload do documento";

      if (!response.ok || data?.status === "erro") {
        throw new Error(data?.mensagem || fallbackErrorMessage);
      }

      setSelectedSupportFiles((prev) => ({ ...prev, [key]: null }));
      showToast("Documento enviado com sucesso.", "success");
      await loadDocumentStatus();
    } catch (error) {
      console.error("Erro ao enviar documento complementar:", error);
      showToast(
        error?.message || "NÃ£o foi possÃ­vel enviar o documento.",
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

  const petRegistrationPanels = [
    {
      id: "pet-registration",
      title: "Mel Pet Hostel",
      summary: "Acesse o sistema operacional do pet hotel.",
      ariaLabel: "Cadastro de pets",
      before: petCadastroObrigatorio ? (
        <p className="pet-registration-required-message">
          Agora chegou o momento de cadastrar o seu Pet. Você precisa ter pelo
          menos um Pet cadastrado para usar o sistema.
        </p>
      ) : null,
      items: [
        {
          id: "new-pet",
          title: "Cadastrar novo pet",
          isOpen: petFormMode === "new" || petCadastroObrigatorio,
          onAction: handleOpenNewPetForm,
          content: (
            <PetRegistrationForm onSubmit={handlePetRegistrationSubmit} />
          ),
        },
        ...(loadingPets
          ? [
              {
                id: "loading-pets",
                title: "Carregando pets cadastrados...",
                disabled: true,
              },
            ]
          : registeredPets.map((pet) => ({
              id: pet.id,
              title: pet.nome,
              summary: getPetSummary(pet),
              isOpen: petFormMode === "view" && selectedPet?.id === pet.id,
              onAction: () => handleOpenPetDetails(pet),
              content: (
                <PetRegistrationForm
                  initialData={getPetFormInitialData(pet)}
                  readOnly
                />
              ),
            }))),
      ],
      after: (
        <div className="pet-main-actions">
          <Button
            type="button"
            variant="outline"
            onClick={handleBackToMainMenu}
          >
            Voltar
          </Button>
        </div>
      ),
    },
  ];

  const adminMenuPanels = [
    {
      id: "admin-melpethostel",
      title: "Mel Pet Hostel",
      summary: "Acesse as ferramentas administrativas do pet hotel.",
      ariaLabel: "Menu da Mel Pet Hostel",
      items: [
        {
          id: "conferir-documentos",
          title: "Aprovar Documentos",
          summary: "Conferir e aprovar documentos enviados.",
          isOpen: activeMenu === "conferirDocumentos",
          onAction: () => {
            setActiveMenu((prev) =>
              prev === "conferirDocumentos" ? "" : "conferirDocumentos",
            );
            setSelectedPendingUser(null);
            setSelectedUserFiles([]);
            setSelectedUserFilesError("");
          },
        },
        {
          id: "controle-planos",
          title: "Controle de Planos",
          summary: "Gerenciar planos e ajustes do módulo.",
          isOpen: activeMenu === "controlePlanos",
          onAction: () => setActiveMenu("controlePlanos"),
        },
      ],
      after: (
        <div className="pet-main-actions">
          <Button
            type="button"
            variant="outline"
            onClick={handleBackToMainMenu}
          >
            Voltar
          </Button>
        </div>
      ),
    },
  ];

  if (
    shouldRenderPetRegistrationDashboard ||
    shouldRenderUserPetRegistrationDashboard
  ) {
    return <MenuTemplate panels={petRegistrationPanels} />;
  }

  return (
    <>
      <MenuTemplate
        panels={
          !loadingStatus &&
          !statusError &&
          isAdmin &&
          (acessoDiretoMenu || petCadastroObrigatorio)
            ? adminMenuPanels
            : []
        }
      >
        {loadingStatus ? (
          <MenuPanel>
            <p>Verificando contrato do usuário...</p>
          </MenuPanel>
        ) : statusError ? (
          <MenuPanel>
            <p className="melpet-error">{statusError}</p>
          </MenuPanel>
        ) : acessoDiretoMenu || petCadastroObrigatorio ? (
          <>
            {isAdmin && activeMenu === "conferirDocumentos" ? (
              <section className="melpet-section-content">
                <div className="melpet-outer-card melpet-validate-card">
                  <div className="melpet-outer-card-header">
                    <h3>Aprovar Documentos</h3>
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
                        Documentos de {selectedPendingUser?.nome || "usuÃ¡rio"}
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
                                  <th>Aprovar</th>
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
                                                  ? "Aprovando..."
                                                  : isConferido
                                                    ? "Aprovado"
                                                    : "Aprovar"}
                                              </button>
                                            </td>
                                            <td>
                                              <button
                                                type="button"
                                                className="melpet-review-btn melpet-review-btn--reject"
                                                onClick={() =>
                                                  showToast(
                                                    "ReprovaÃ§Ã£o ainda nÃ£o integrada.",
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
              <section className="melpet-section-content">
                <p>
                  Área de controle de planos. Aqui você poderá gerenciar planos
                  e ajustes do módulo.
                </p>
              </section>
            ) : null}
          </>
        ) : (
          <MenuPanel
            className="melpet-upload-home"
            summary={uploadPanelSummary}
            title="Mel Pet Hostel"
          >
            <MenuList
              ariaLabel="Contrato e documentos obrigatórios"
              className="melpet-upload-accordion"
            >
              <MenuItem
                contentClassName="melpet-upload-content"
                isOpen={uploadPanelOpen}
                onAction={() => setUploadPanelOpen((current) => !current)}
                title="Contrato e Documentos Obrigatórios"
              >
                <ul className="melpet-upload-doc-list">
                  <li
                    className={`melpet-upload-doc-item ${
                      contratoDetectado ? "is-done" : "is-pending"
                    }`}
                  >
                    <div className="melpet-upload-doc-main">
                      <div className="melpet-upload-doc-copy">
                        <strong>Contrato assinado</strong>
                        <span
                          className={
                            contratoDetectado
                              ? "melpet-doc-status melpet-doc-status--done"
                              : "melpet-doc-status melpet-doc-status--pending"
                          }
                        >
                          {contratoDetectado
                            ? "Enviado para conferência"
                            : "Pendente"}
                        </span>
                      </div>

                      {!contratoDetectado ? (
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
                      ) : null}
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
                  </li>

                  {shouldShowSupportDocsCard
                    ? SUPPORT_DOC_FIELDS.map((field) => {
                        const selectedSupportFile =
                          selectedSupportFiles[field.key];
                        const isUploadingThis =
                          uploadingSupportKey === field.key;
                        const isConcluded =
                          documentStatusByKey[field.key]?.existsDb &&
                          documentStatusByKey[field.key]?.existsDisk;
                        const identifiedCount =
                          documentStatusByKey[field.key]?.identifiedCount || 0;
                        const supportActionDisabled =
                          Boolean(uploadingSupportKey) ||
                          (field.required && isConcluded);
                        return (
                          <li
                            key={field.key}
                            className={`melpet-upload-doc-item ${
                              isConcluded ? "is-done" : "is-pending"
                            }`}
                          >
                            <div className="melpet-upload-doc-main">
                              <div className="melpet-upload-doc-copy">
                                <strong>{field.label}</strong>
                                {field.required ? (
                                  <span
                                    className={
                                      isConcluded
                                        ? "melpet-doc-status melpet-doc-status--done"
                                        : "melpet-doc-status melpet-doc-status--pending"
                                    }
                                  >
                                    {isConcluded
                                      ? "Enviado para conferência"
                                      : "Pendente"}
                                  </span>
                                ) : (
                                  <span>
                                    {identifiedCount} identificado
                                    {identifiedCount === 1 ? "" : "s"}
                                  </span>
                                )}
                              </div>
                              <Button
                                type="button"
                                onClick={() =>
                                  handleSupportPrimaryAction(field.key)
                                }
                                disabled={supportActionDisabled}
                              >
                                {isUploadingThis
                                  ? "Enviando..."
                                  : selectedSupportFile
                                    ? "Enviar"
                                    : "Upload"}
                              </Button>
                            </div>

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
                          </li>
                        );
                      })
                    : null}
                </ul>

                {firstStepComplete ? (
                  <p className="melpet-first-step-message">
                    A sua primeira etapa está concluída. Por favor aguarde a
                    validação dos documentos para liberar o acesso ao sistema.
                  </p>
                ) : null}
              </MenuItem>
            </MenuList>
          </MenuPanel>
        )}
      </MenuTemplate>

      <ContractModal
        isOpen={contractModalOpen}
        initialContractorData={contractorData}
        onClose={() => setContractModalOpen(false)}
        onRejectBeforeAccept={logout}
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
    </>
  );
}
