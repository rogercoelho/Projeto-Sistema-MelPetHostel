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
import { maskCpf } from "../../utils/brFields";
import { buildContractorDataFromCliente } from "../../utils/clientProfile";
import { formatDateTimeSaoPaulo } from "../../utils/date";
import melPetHostelLogo from "./assets/MelPetHostel_Logo.jpeg";
import PetRegistrationForm from "./PetRegistrationForm";
import { PET_ANAMNESIS_SECTIONS } from "./petAnamnesisForm";
import "./styles.css";

const SUPPORT_DOC_FIELDS = [
  {
    key: "identificacao",
    label:
      "Documento de identificação -> 2 - Envie o documento de identificação do cliente ",
    tipoNome: "Documento de Identificacao",
    required: true,
  },
  {
    key: "comprovante",
    label:
      "Comprovante de Endereço -> 3 - Envie o comprovante de endereço do cliente",
    tipoNome: "Comprovante de Endereco",
    required: true,
  },
  {
    key: "outros",
    label:
      "Outros Documentos -> 4 - Envie outros documentos do cliente (opcional)",
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

function calculatePetAgeParts(dataNascimento) {
  if (!dataNascimento) return null;
  const [year, month, day] = String(dataNascimento)
    .slice(0, 10)
    .split("-")
    .map(Number);
  if (!year || !month || !day) return null;

  const today = new Date();
  const birthDate = new Date(year, month - 1, day);
  if (Number.isNaN(birthDate.getTime()) || birthDate > today) return null;

  let years = today.getFullYear() - year;
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();
  if (currentMonth < month || (currentMonth === month && currentDay < day))
    years -= 1;

  let months = (today.getFullYear() - year) * 12 + (currentMonth - month);
  if (currentDay < day) months -= 1;

  return { years: Math.max(0, years), months: Math.max(0, months) };
}

function calculatePetAgeYears(dataNascimento) {
  return calculatePetAgeParts(dataNascimento)?.years ?? null;
}

function calculatePetAgeLabel(dataNascimento) {
  const age = calculatePetAgeParts(dataNascimento);
  if (!age) return "";
  if (age.years >= 1) return `${age.years} ${age.years === 1 ? "ano" : "anos"}`;
  return `${age.months} ${age.months === 1 ? "mes" : "meses"}`;
}
function formatPetAge(value) {
  const age = String(value || "").trim();
  if (!age) return "";
  return /\b(ano|anos|mes|meses)\b/i.test(age) ? age : `${age} anos`;
}

function formatPetWeight(value) {
  const weight = String(value || "").trim();
  if (!weight) return "";
  return /\bkg\b/i.test(weight) ? weight : `${weight} kg`;
}

function getPetSummary(pet) {
  return [
    pet?.raca,
    formatPetAge(calculatePetAgeLabel(pet?.dataNascimento)),
    formatPetWeight(pet?.pesoAproximado),
  ]
    .filter(Boolean)
    .join(" - ");
}

function normalizeVaccineType(item, fallbackDuration = "") {
  if (item && typeof item === "object") {
    const descricao =
      item.descricao ||
      item.tipo ||
      item.label ||
      item.nome ||
      item.valor ||
      item.value ||
      "";
    return {
      descricao: String(descricao).trim(),
      duracao: String(item.duracao || fallbackDuration || "").trim(),
    };
  }
  if (String(item || "").trim() === "[object Object]") {
    return { descricao: "", duracao: String(fallbackDuration || "").trim() };
  }
  return {
    descricao: String(item || "").trim(),
    duracao: String(fallbackDuration || "").trim(),
  };
}

function normalizeVaccineTypes(tipos = [], fallbackDuration = "") {
  const items = Array.isArray(tipos) ? tipos : [];
  const mapped = items
    .map((item) => normalizeVaccineType(item, fallbackDuration))
    .filter((item) => item.descricao);
  return Array.from(
    new Map(
      mapped.map((item) => [normalizeText(item.descricao), item]),
    ).values(),
  );
}

function getVaccineTypeLabel(tipo) {
  const item = normalizeVaccineType(tipo);
  return item.duracao
    ? `${item.descricao} - Duração: ${item.duracao} meses`
    : item.descricao;
}

function parseVaccineResponseValues(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    return [String(value)].filter(Boolean);
  }
  return [String(value)].filter(Boolean);
}

function getSingleVaccineResponseValue(value) {
  return parseVaccineResponseValues(value)[0] || "";
}

function formatBrazilDate(value) {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "-";
  const [year, month, day] = text.split("-");
  return `${day}/${month}/${year}`;
}

function addMonthsToDate(value, months) {
  const text = String(value || "").slice(0, 10);
  const amount = Number.parseInt(months, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(amount)) {
    return "";
  }

  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const originalDay = date.getDate();
  date.setMonth(date.getMonth() + amount);
  if (date.getDate() < originalDay) {
    date.setDate(0);
  }

  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function getPetFormInitialData(pet) {
  return {
    ...(pet?.ficha || {}),
    nomePet: pet?.ficha?.nomePet || pet?.nome || "",
    raca: pet?.ficha?.raca || pet?.raca || "",
    dataNascimento: pet?.ficha?.dataNascimento || pet?.dataNascimento || "",
    pesoAproximado: pet?.ficha?.pesoAproximado || pet?.pesoAproximado || "",
  };
}

function isExpurgoCarteira(item) {
  const status = String(item?.status || "").toLowerCase();
  const filePath = String(item?.filePath || item?.file_path || "").replace(
    /\\/g,
    "/",
  );
  return status === "expurgado" || /\/expurgo\//i.test(filePath);
}

function getActivePetCarteiras(pet) {
  const carteiras = Array.isArray(pet?.carteiras) ? pet.carteiras : [];
  return carteiras.filter((item) => !isExpurgoCarteira(item));
}

function getCurrentPetCarteiras(pet) {
  return getActivePetCarteiras(pet).filter(
    (item) => item?.status !== "reprovado",
  );
}

function carteiraHasStoredFile(carteira) {
  return Boolean(
    carteira?.id &&
    (carteira.fileUrl || carteira.filePath || carteira.file_path),
  );
}

function getSubmittedPetCarteiras(pet) {
  return getCurrentPetCarteiras(pet).filter(carteiraHasStoredFile);
}

function getPetRejectionReasons(pet) {
  return getActivePetCarteiras(pet)
    .filter((item) => item?.status === "reprovado")
    .map((item) => String(item?.motivoReprovacao || "").trim())
    .filter(Boolean);
}

function getLatestCarteiraBySide(pet, side) {
  const targetSide = side === "verso" ? "verso" : "frente";
  return getActivePetCarteiras(pet)
    .filter(
      (item) => (item?.lado === "verso" ? "verso" : "frente") === targetSide,
    )
    .sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))[0];
}

function getPetCarteiraSideStatus(pet, side) {
  const carteira = getLatestCarteiraBySide(pet, side);
  if (!carteira) {
    return { label: "Pendente", tone: "pending", motivo: "" };
  }
  if (carteira.status === "reprovado") {
    return {
      label: "Reprovado",
      tone: "rejected",
      motivo: String(carteira.motivoReprovacao || "").trim(),
    };
  }
  if (carteira.conferido || carteira.status === "aprovado") {
    return { label: "Aprovado", tone: "done", motivo: "" };
  }
  return { label: "Enviado para conferência", tone: "pending", motivo: "" };
}

export default function MelPetHostel({
  onBack,
  clientProfile,
  clientProfileReady = true,
  clientProfilePending = false,
  enforceContractGate = false,
  initialAdminMenu = "",
  userMenu = "",
  initialAdminPet = null,
  onBackToInitialAdminPetSource,
  onNavigateUserMenu,
  petRegistrationOnly = false,
  contractPromptRequest = 0,
  onPetRegistered,
}) {
  const { usuario, logout } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef(null);
  const supportFileRefs = useRef({});
  const petVaccineFileRefs = useRef({});
  const hostingPaymentFileRefs = useRef({});
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
    identificacao: {
      existsDb: false,
      existsDisk: false,
      identifiedCount: 0,
      status: "pendente",
      motivoReprovacao: "",
    },
    comprovante: {
      existsDb: false,
      existsDisk: false,
      identifiedCount: 0,
      status: "pendente",
      motivoReprovacao: "",
    },
    outros: {
      existsDb: false,
      existsDisk: false,
      identifiedCount: 0,
      status: "pendente",
      motivoReprovacao: "",
    },
  });
  const [uploading, setUploading] = useState(false);
  const [uploadingSupportKeys, setUploadingSupportKeys] = useState({});
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [uploadPanelOpen, setUploadPanelOpen] = useState(true);
  const [registeredPets, setRegisteredPets] = useState([]);
  const [loadingPets, setLoadingPets] = useState(false);
  const [petFormMode, setPetFormMode] = useState("list");
  const [selectedPet, setSelectedPet] = useState(null);
  const [petDocsPet, setPetDocsPet] = useState(null);
  const [pendingDeletePet, setPendingDeletePet] = useState(null);
  const [deletingPetId, setDeletingPetId] = useState(null);
  const [petVaccineConfigs, setPetVaccineConfigs] = useState([]);
  const [petVaccineResponses, setPetVaccineResponses] = useState({});
  const [petVaccineResponsesSaved, setPetVaccineResponsesSaved] =
    useState(false);
  const [vaccineCardItems, setVaccineCardItems] = useState([]);
  const [editingAdminPetVaccines, setEditingAdminPetVaccines] = useState(false);
  const [loadingVaccineCardInfo, setLoadingVaccineCardInfo] = useState(false);
  const [vaccineCardInfoError, setVaccineCardInfoError] = useState("");
  const [petVaccineFiles, setPetVaccineFiles] = useState({
    frente: null,
    verso: null,
  });
  const [uploadedPetVaccineSides, setUploadedPetVaccineSides] = useState({
    frente: false,
    verso: false,
  });
  const [uploadingPetVaccineSide, setUploadingPetVaccineSide] = useState("");
  const [savingPetVaccines, setSavingPetVaccines] = useState(false);
  const [activeHostingMenu, setActiveHostingMenu] = useState("");
  const [hostingHistoryStatusFilter, setHostingHistoryStatusFilter] =
    useState("all");
  const [hostingRequestOpenId, setHostingRequestOpenId] = useState(null);
  const [cancelingHostingRequestId, setCancelingHostingRequestId] =
    useState(null);
  const [hostingPetIds, setHostingPetIds] = useState([]);
  const [hostingPetPeriods, setHostingPetPeriods] = useState({});
  const [sendingHostingRequest, setSendingHostingRequest] = useState(false);
  const [hostingRequests, setHostingRequests] = useState([]);
  const [loadingHostingRequests, setLoadingHostingRequests] = useState(false);
  const [hostingRequestsError, setHostingRequestsError] = useState("");
  const [pendingHostingRequests, setPendingHostingRequests] = useState([]);
  const [loadingPendingHostingRequests, setLoadingPendingHostingRequests] =
    useState(false);
  const [pendingHostingRequestsError, setPendingHostingRequestsError] =
    useState("");
  const [selectedPendingHostingId, setSelectedPendingHostingId] =
    useState(null);
  const [reviewingHostingRequestId, setReviewingHostingRequestId] =
    useState(null);
  const [hostingApprovalAdjustments, setHostingApprovalAdjustments] = useState(
    {},
  );
  const [rejectHostingTarget, setRejectHostingTarget] = useState(null);
  const [rejectHostingReason, setRejectHostingReason] = useState("");
  const [pixConfigForm, setPixConfigForm] = useState({
    chavePix: "",
    nomeRecebedor: "Mel Pet Hostel",
    cidadeRecebedor: "SAO PAULO",
  });
  const [loadingPixConfig, setLoadingPixConfig] = useState(false);
  const [savingPixConfig, setSavingPixConfig] = useState(false);
  const [pixConfigError, setPixConfigError] = useState("");
  const [hostingPaymentFiles, setHostingPaymentFiles] = useState({});
  const [uploadingHostingPaymentId, setUploadingHostingPaymentId] =
    useState(null);
  const [generatingHostingPaymentId, setGeneratingHostingPaymentId] =
    useState(null);
  const [pendingHostingPaymentRequests, setPendingHostingPaymentRequests] =
    useState([]);
  const [loadingHostingPaymentReceipts, setLoadingHostingPaymentReceipts] =
    useState(false);
  const [pendingCardPaymentRequests, setPendingCardPaymentRequests] = useState(
    [],
  );
  const [cardPaymentLinks, setCardPaymentLinks] = useState({});
  const [loadingCardPaymentRequests, setLoadingCardPaymentRequests] =
    useState(false);
  const [sendingCardPaymentLinkId, setSendingCardPaymentLinkId] =
    useState(null);
  const [pendingHostingCheckinRequests, setPendingHostingCheckinRequests] =
    useState([]);
  const [loadingHostingCheckinRequests, setLoadingHostingCheckinRequests] =
    useState(false);
  const [confirmingHostingCheckinId, setConfirmingHostingCheckinId] =
    useState(null);
  const [presencePets, setPresencePets] = useState([]);
  const [activePresencePetId, setActivePresencePetId] = useState(null);
  const [presenceCompetence, setPresenceCompetence] = useState("");
  const [presenceSummary, setPresenceSummary] = useState(null);
  const [presenceViewMode, setPresenceViewMode] = useState("calendar");
  const [loadingPresence, setLoadingPresence] = useState(false);
  const [togglingPresenceDate, setTogglingPresenceDate] = useState("");
  const [approvingHostingPaymentId, setApprovingHostingPaymentId] =
    useState(null);
  const [rejectHostingPaymentTarget, setRejectHostingPaymentTarget] =
    useState(null);
  const [rejectHostingPaymentReason, setRejectHostingPaymentReason] =
    useState("");
  const [paymentPreview, setPaymentPreview] = useState(null);
  const [activeMenu, setActiveMenu] = useState(
    initialAdminMenu === "cadastroPets" ? "" : initialAdminMenu,
  );
  const [petStatusSearchTerm, setPetStatusSearchTerm] = useState("");
  const [petStatusResults, setPetStatusResults] = useState([]);
  const [loadingPetStatus, setLoadingPetStatus] = useState(false);
  const [petStatusSubmitted, setPetStatusSubmitted] = useState(false);
  const [petStatusError, setPetStatusError] = useState("");
  const [selectedAdminPet, setSelectedAdminPet] = useState(null);
  const [savingPetStatusId, setSavingPetStatusId] = useState(null);
  const [pendingVaccineCards, setPendingVaccineCards] = useState([]);
  const [loadingVaccineCards, setLoadingVaccineCards] = useState(false);
  const [vaccineCardsError, setVaccineCardsError] = useState("");
  const [selectedVaccineUser, setSelectedVaccineUser] = useState(null);
  const [approvingVaccineCardId, setApprovingVaccineCardId] = useState(null);
  const [rejectingVaccineCardId, setRejectingVaccineCardId] = useState(null);
  const [rejectVaccineCardTarget, setRejectVaccineCardTarget] = useState(null);
  const [rejectVaccineReason, setRejectVaccineReason] = useState("");
  const [vaccineConfigItems, setVaccineConfigItems] = useState([]);
  const [loadingVaccineConfig, setLoadingVaccineConfig] = useState(false);
  const [savingVaccineConfig, setSavingVaccineConfig] = useState(false);
  const [deletingVaccineConfigId, setDeletingVaccineConfigId] = useState(null);
  const [deleteWarningVaccineConfig, setDeleteWarningVaccineConfig] =
    useState(null);
  const [confirmDeleteVaccineConfigId, setConfirmDeleteVaccineConfigId] =
    useState(null);
  const [vaccineConfigError, setVaccineConfigError] = useState("");
  const [editingVaccineConfigId, setEditingVaccineConfigId] = useState(null);
  const [vaccineConfigForm, setVaccineConfigForm] = useState({
    descricao: "",
    obrigatorio: false,
    tipos: [],
    tipoAtual: "",
    tipoDuracaoAtual: "",
  });
  const [planos, setPlanos] = useState([]);
  const [loadingPlanos, setLoadingPlanos] = useState(false);
  const [savingPlano, setSavingPlano] = useState(false);
  const [planosError, setPlanosError] = useState("");
  const [editingPlanoId, setEditingPlanoId] = useState(null);
  const [openPlanoTipos, setOpenPlanoTipos] = useState({});
  const [planoForm, setPlanoForm] = useState({
    tipo: "",
    categoriaDe: "",
    categoriaAte: "",
    unidade: "Kg",
    tipoCobranca: "unico",
    tipoCalculo: "pernoite",
    tempoQuantidade: "1",
    tempoUnidade: "dia",
    valor: "",
  });
  const [documentPreviewOpen, setDocumentPreviewOpen] = useState(false);
  const [documentPreviewTitle, setDocumentPreviewTitle] = useState("");
  const [documentPreviewSrc, setDocumentPreviewSrc] = useState("");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const usuarioAcesso = String(
    (usuario && (usuario.grupoAcesso || usuario.Grupo_Acesso)) || "",
  ).toLowerCase();
  const isAdmin = usuarioAcesso === "adm";

  useEffect(() => {
    if (isAdmin) {
      setActiveMenu(
        initialAdminMenu === "cadastroPets" ? "" : initialAdminMenu || "",
      );
    }
  }, [initialAdminMenu, isAdmin]);

  useEffect(() => {
    if (!isAdmin || !initialAdminPet?.pet) return;
    setActiveMenu("pesquisarPets");
    handleOpenAdminPetFicha(initialAdminPet.tutor || {}, initialAdminPet.pet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAdminPet, isAdmin]);
  useEffect(() => {
    if (!isAdmin || activeMenu === "aprovarHospedagens") return;
    setPendingHostingRequests([]);
    setPendingHostingRequestsError("");
    setSelectedPendingHostingId(null);
  }, [activeMenu, isAdmin]);

  useEffect(() => {
    if (!isAdmin || activeMenu !== "analisarComprovantes") return;
    loadPendingHostingPaymentReceipts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMenu, isAdmin]);

  useEffect(() => {
    if (!isAdmin || activeMenu !== "configurarPix") return;
    loadPixConfig();
  }, [activeMenu, isAdmin]);

  useEffect(() => {
    if (!isAdmin || activeMenu !== "registrarPresenca") return;
    setActivePresencePetId(null);
    setPresenceSummary(null);
    loadPresencePets(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMenu, isAdmin]);

  const shouldEnforceContractGate = Boolean(!isAdmin && enforceContractGate);
  const contratoValido = Boolean(contractStatus?.contratoValido);
  const petCadastroObrigatorio = Boolean(
    !isAdmin && contratoValido && !loadingPets && registeredPets.length === 0,
  );
  const fluxoObrigatorioPets = Boolean(
    !isAdmin && petRegistrationOnly && shouldEnforceContractGate,
  );
  const deveBloquearVoltarNoFluxoPet = Boolean(
    fluxoObrigatorioPets && registeredPets.length <= 1,
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
  const contratoReprovado = Boolean(contractStatus?.contratoReprovado);
  const contratoMotivoReprovacao = String(
    contractStatus?.motivoReprovacao || "",
  ).trim();
  const contratoEnviado = Boolean(
    shouldEnforceContractGate &&
    contractStatus?.possuiContratoDb &&
    contractStatus?.arquivoExiste,
  );
  const contratoDetectado = Boolean(contratoEnviado && !contratoReprovado);
  const contratoStatusClass = contratoReprovado
    ? "rejected"
    : contratoDetectado
      ? "pending"
      : "pending";
  const contratoStatusLabel = contratoReprovado
    ? "Reprovado"
    : contratoDetectado
      ? "Enviado para conferencia"
      : "Pendente";
  const profileGateActive = Boolean(
    shouldEnforceContractGate && (!clientProfileReady || clientProfilePending),
  );
  const actionButtonsDisabled =
    (contratoDetectado && !contratoReprovado) || uploading || profileGateActive;
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
  function isSupportDocumentSubmitted(key) {
    const status = documentStatusByKey[key];
    return Boolean(
      status?.existsDb &&
      status?.existsDisk &&
      String(status?.status || "").toLowerCase() !== "reprovado",
    );
  }

  const requiredDocsComplete = requiredDocKeys.every((key) =>
    isSupportDocumentSubmitted(key),
  );

  const pendingRequiredDocsCount = requiredDocKeys.filter(
    (key) => !isSupportDocumentSubmitted(key),
  ).length;
  const pendingUploadItemsCount =
    (contratoEnviado ? 0 : 1) + pendingRequiredDocsCount;
  const uploadPanelSummary = contratoReprovado
    ? "Contrato reprovado. Envie o contrato corrigido."
    : contratoDetectado && requiredDocsComplete
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
    !contratoEnviado &&
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

  function handleSignedContractUploadFromModal() {
    setContractModalOpen(false);
    setUploadPanelOpen(true);
    setActiveMenu("");
  }

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
          status: "pendente",
          motivoReprovacao: "",
        },
        comprovante: {
          existsDb: false,
          existsDisk: false,
          identifiedCount: 0,
          status: "pendente",
          motivoReprovacao: "",
        },
        outros: {
          existsDb: false,
          existsDisk: false,
          identifiedCount: 0,
          status: "pendente",
          motivoReprovacao: "",
        },
      };

      for (const doc of docs) {
        const key = doc?.key;
        if (key && Object.prototype.hasOwnProperty.call(nextStatus, key)) {
          nextStatus[key] = {
            existsDb: Boolean(doc.existsDb),
            existsDisk: Boolean(doc.existsDisk),
            identifiedCount: Number(doc.identifiedCount) || 0,
            status: doc?.status || "pendente",
            motivoReprovacao: doc?.motivoReprovacao || "",
          };
        }
      }

      setDocumentStatusByKey(nextStatus);
    } catch (error) {
      console.error("Erro ao carregar status dos documentos:", error);
    }
  }

  function buildDocumentPreviewUrl(file) {
    const tipo = file?.tipoRegistro === "contrato" ? "contrato" : "documento";
    const id =
      tipo === "contrato"
        ? Number(file?.contratoId)
        : Number(file?.documentoId);
    if (!Number.isInteger(id) || id <= 0) return null;
    const params = new window.URLSearchParams({ tipo, id: String(id) });
    return `/melpethostel/documentos/preview?${params.toString()}`;
  }

  function handleOpenDocumentPreview(file) {
    const url = buildDocumentPreviewUrl(file);
    if (!url) {
      showToast("Nao foi possivel abrir este documento.", "error");
      return;
    }
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

  function buildFileUrl(fileUrl) {
    const raw = String(fileUrl || "").trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    const base = String(API_URL).replace(/\/+$/, "");
    return `${base}${raw.startsWith("/") ? raw : `/${raw}`}`;
  }

  async function loadPendingVaccineCards() {
    setLoadingVaccineCards(true);
    setVaccineCardsError("");
    try {
      const data = await api.get(
        "/melpethostel/pets/carteiras-vacinacao/pendentes",
      );
      const cards = Array.isArray(data?.carteiras) ? data.carteiras : [];
      setPendingVaccineCards(cards);
      setSelectedVaccineUser((current) => {
        if (!current) return null;
        return cards.some((card) => getVaccineUserKey(card) === current.key)
          ? current
          : null;
      });
    } catch (error) {
      console.error("Erro ao carregar carteiras pendentes:", error);
      setPendingVaccineCards([]);
      setSelectedVaccineUser(null);
      setVaccineCardsError(
        error?.message || "Não foi possível carregar as carteiras pendentes.",
      );
    } finally {
      setLoadingVaccineCards(false);
    }
  }

  async function handleApproveVaccineCard(card) {
    const id = Number(card?.id);
    if (!Number.isInteger(id) || id <= 0) return;

    setApprovingVaccineCardId(id);
    try {
      await api.post(
        `/melpethostel/pets/carteiras-vacinacao/${id}/aprovar`,
        {},
      );
      setPendingVaccineCards((current) =>
        (current || []).filter((item) => Number(item.id) !== id),
      );
      setSelectedVaccineUser((current) => {
        if (!current) return null;
        const hasPendingCardForUser = pendingVaccineCards.some(
          (item) =>
            Number(item.id) !== id && getVaccineUserKey(item) === current.key,
        );
        return hasPendingCardForUser ? current : null;
      });
      showToast("Carteira de vacinação aprovada com sucesso.", "success");
    } catch (error) {
      showToast(
        error?.message || "Não foi possível aprovar a carteira de vacinação.",
        "error",
      );
    } finally {
      setApprovingVaccineCardId(null);
    }
  }

  function openRejectVaccineCardModal(card) {
    if (!card?.id) return;
    setRejectVaccineCardTarget(card);
    setRejectVaccineReason("");
  }

  function closeRejectVaccineCardModal() {
    if (rejectingVaccineCardId) return;
    setRejectVaccineCardTarget(null);
    setRejectVaccineReason("");
  }

  async function submitRejectVaccineCard() {
    const card = rejectVaccineCardTarget;
    const id = Number(card?.id);
    if (!Number.isInteger(id) || id <= 0) return;
    const motivoReprovacao = rejectVaccineReason.trim();
    if (!motivoReprovacao) {
      showToast("Informe o motivo da reprovação.", "error");
      return;
    }

    setRejectingVaccineCardId(id);
    try {
      await api.post(`/melpethostel/pets/carteiras-vacinacao/${id}/reprovar`, {
        motivoReprovacao,
      });
      setPendingVaccineCards((current) =>
        (current || []).filter((item) => Number(item.id) !== id),
      );
      setSelectedVaccineUser((current) => {
        if (!current) return null;
        const hasPendingCardForUser = pendingVaccineCards.some(
          (item) =>
            Number(item.id) !== id && getVaccineUserKey(item) === current.key,
        );
        return hasPendingCardForUser ? current : null;
      });
      showToast("Carteira de vacinação reprovada com sucesso.", "success");
      closeRejectVaccineCardModal();
    } catch (error) {
      showToast(
        error?.message || "Não foi possível reprovar a carteira de vacinação.",
        "error",
      );
    } finally {
      setRejectingVaccineCardId(null);
    }
  }

  function getVaccineUserKey(card) {
    return String(card?.clienteId || card?.clienteNome || "");
  }

  function buildVaccineUserList(cards) {
    const usersByKey = new Map();

    for (const card of cards || []) {
      const key = getVaccineUserKey(card);
      if (!key || usersByKey.has(key)) continue;

      usersByKey.set(key, {
        key,
        clienteId: card?.clienteId,
        nome: card?.clienteNome || `Cliente ${card?.clienteId}`,
      });
    }

    return Array.from(usersByKey.values());
  }

  function handleOpenVaccineUser(user) {
    setSelectedVaccineUser((current) =>
      current?.key === user?.key ? null : user,
    );
  }

  function getVaccineDocumentName(card) {
    return `Carteira de vacinação ${
      card?.lado === "verso" ? "Verso" : "Frente"
    }`;
  }

  function formatCurrency(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "R$ 0,00";
    return number.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function formatDateTime(value) {
    return formatDateTimeSaoPaulo(value);
  }

  function formatBillingMode(value) {
    const normalized = normalizeText(value);
    if (normalized === "unico") return "único";
    if (normalized === "mensal") return "mensal";
    if (normalized === "recorrente") return "recorrente";
    return value || "-";
  }

  function getHostingRequestStatusLabel(status) {
    const normalized = normalizeText(status);
    if (normalized.includes("cancel")) return "Cancelado";
    if (normalized.includes("conclu")) return "Concluído";
    if (normalized.includes("confirm")) return "Confirmado";
    if (normalized.includes("aprov")) return "Aprovado";
    if (normalized.includes("recus")) return "Recusado";
    if (normalized.includes("anal") || normalized.includes("aguard"))
      return "Pendente";
    return "Pendente";
  }

  function getHostingRequestStatusDetail(status) {
    const normalized = normalizeText(status);
    if (normalized.includes("aprov")) return "Pagamento Pendente";
    if (normalized.includes("recus")) return "Pedido recusado";
    if (normalized.includes("anal")) return "Aguardando análise";
    if (normalized.includes("aguard")) return "Aguardando pagamento";
    if (normalized.includes("confirm")) return "Pagamento confirmado";
    if (normalized.includes("conclu")) return "Hospedagem concluída";
    if (normalized.includes("cancel")) return "Pedido cancelado";
    return "Aguardando análise";
  }

  function getHostingRequestStatusTone(status) {
    const normalized = normalizeText(status);
    if (normalized.includes("aprov")) return "approved";
    if (normalized.includes("recus") || normalized.includes("reprov"))
      return "rejected";
    if (normalized.includes("anal")) return "review";
    if (normalized.includes("confirm")) return "confirmed";
    if (normalized.includes("conclu")) return "completed";
    if (normalized.includes("cancel")) return "canceled";
    return "pending";
  }

  function getHostingRequestStatusIcon(status) {
    const tone = getHostingRequestStatusTone(status);
    if (tone === "approved") return "✓";
    if (tone === "rejected") return "×";
    if (tone === "review") return "⬦";
    if (tone === "confirmed") return "✓";
    if (tone === "completed") return "✓";
    if (tone === "canceled") return "×";
    return "•";
  }

  function getHostingRequestStatusKey(status) {
    const normalized = normalizeText(status);
    if (normalized.includes("aprov")) return "aprovado";
    if (normalized.includes("aguard")) return "aguardando_pagamento";
    if (normalized.includes("confirm")) return "confirmado";
    if (normalized.includes("conclu")) return "concluido";
    if (normalized.includes("recus") || normalized.includes("reprov"))
      return "recusado";
    if (normalized.includes("cancel")) return "cancelado";
    return "pendente";
  }

  function getHostingFilterStatusKey(request) {
    if (
      hasMonthlyCancellationRequested(request) &&
      isMonthlyCancellationStillValid(request)
    ) {
      return "confirmado";
    }
    return getHostingRequestStatusKey(request?.status);
  }
  function getHostingRequestStatusActionLabel(status) {
    const key = getHostingRequestStatusKey(status);
    if (key === "aprovado") return "Aprovado";
    if (key === "aguardando_pagamento") return "Aguardando pagamento";
    if (key === "confirmado") return "Confirmado";
    if (key === "concluido") return "Concluído";
    if (key === "cancelado") return "Cancelado";
    return "Pendente";
  }

  function canCancelHostingRequest(status, request = null) {
    const key = getHostingRequestStatusKey(status);
    if (isMonthlyHostingRequest(request)) {
      const payment = getMonthlyPayment(request);
      if (payment?.mensalidadeStatus === "cancelamento_solicitado") {
        return false;
      }
    }
    return (
      key === "pendente" ||
      key === "aprovado" ||
      key === "aguardando_pagamento" ||
      (key === "confirmado" && isMonthlyHostingRequest(request))
    );
  }

  function formatHostingRequestPeriod(request) {
    if (request?.modoCobranca === "unico") {
      return `${formatBrazilDate(request.dataEntrada)} a ${formatBrazilDate(
        request.dataSaida,
      )} · ${request.dias || 0} dias`;
    }

    return `${formatStartMonth(request.inicioMes)} · ${formatBillingMode(
      request.modoCobranca,
    )}`;
  }

  function formatMonthlyHostingItem(item) {
    const quantity = Math.max(1, Number(item?.tempoQuantidade || 1));
    const unit = normalizeText(item?.tempoUnidade || "semana");
    const frequency = unit.includes("semana")
      ? `${quantity}x por semana`
      : `${quantity} ${item?.tempoUnidade || "vez(es)"}`;
    return `${item?.tipo || "Plano"} · ${frequency} · mensal`;
  }
  function formatHostingItemPeriod(item) {
    if (item?.modoCobranca === "unico") {
      return `${formatBrazilDate(item.dataEntrada)} a ${formatBrazilDate(
        item.dataSaida,
      )} · ${item.dias || 0} dias`;
    }

    return `${formatStartMonth(item.inicioMes)} · ${formatBillingMode(
      item.modoCobranca,
    )}`;
  }

  function maskCurrencyInput(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    const cents = Number(digits) / 100;
    return cents.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function getHostingApprovalAdjustment(request) {
    const adjustment = hostingApprovalAdjustments[request?.id] || {};
    const value = Number(String(adjustment.value || "").replace(",", "."));
    const baseValue = Number(request?.valorTotal || 0);
    const rawValue = Number.isFinite(value) && value > 0 ? value : 0;
    const calculatedValue =
      adjustment.mode === "percentual"
        ? Number(((baseValue * rawValue) / 100).toFixed(2))
        : rawValue;
    const finalValue =
      adjustment.type === "acrescimo"
        ? baseValue + calculatedValue
        : Math.max(0, baseValue - calculatedValue);
    return {
      type: adjustment.type || "desconto",
      mode: adjustment.mode || "valor",
      value: rawValue,
      reason: adjustment.reason || "",
      calculatedValue,
      finalValue,
    };
  }
  async function loadPlanos() {
    setLoadingPlanos(true);
    setPlanosError("");
    try {
      const data = await api.get("/melpethostel/planos");
      setPlanos(Array.isArray(data?.planos) ? data.planos : []);
    } catch (error) {
      setPlanos([]);
      setPlanosError(error?.message || "Não foi possível carregar os planos.");
    } finally {
      setLoadingPlanos(false);
    }
  }

  async function loadPendingHostingRequests() {
    setLoadingPendingHostingRequests(true);
    setPendingHostingRequestsError("");
    try {
      const data = await api.get(
        "/melpethostel/hospedagens/solicitacoes/pendentes",
      );
      setPendingHostingRequests(
        Array.isArray(data?.solicitacoes) ? data.solicitacoes : [],
      );
    } catch (error) {
      setPendingHostingRequests([]);
      setPendingHostingRequestsError(
        error?.message || "Não foi possível carregar hospedagens pendentes.",
      );
    } finally {
      setLoadingPendingHostingRequests(false);
    }
  }

  function openRejectHostingModal(request) {
    setRejectHostingTarget(request);
    setRejectHostingReason("");
  }

  function closeRejectHostingModal() {
    if (reviewingHostingRequestId) return;
    setRejectHostingTarget(null);
    setRejectHostingReason("");
  }

  async function approveHostingRequest(request) {
    if (!request?.id) return;
    const adjustment = getHostingApprovalAdjustment(request);
    if (adjustment.value > 0 && !adjustment.reason.trim()) {
      showToast("Informe o motivo do desconto ou acréscimo.", "warning");
      return;
    }
    setReviewingHostingRequestId(request.id);
    try {
      const data = await api.patch(
        "/melpethostel/hospedagens/solicitacoes/" + request.id + "/aprovar",
        adjustment.value > 0
          ? {
              ajusteTipo: adjustment.type,
              ajusteModo: adjustment.mode,
              ajusteValor: adjustment.value,
              ajusteMotivo: adjustment.reason.trim(),
            }
          : {},
      );
      showToast("Hospedagem aprovada.", "success");
      if (data?.email && !data.email.sent) {
        showToast(
          data.email.reason === "email_nao_informado"
            ? "Hospedagem aprovada, mas o tutor não possui e-mail cadastrado."
            : "Hospedagem aprovada, mas o e-mail não foi enviado. Verifique as variáveis SMTP e reinicie o app NodeJS.",
          "warning",
        );
      }
      setPendingHostingRequests((current) =>
        current.filter((item) => Number(item.id) !== Number(request.id)),
      );
      setHostingApprovalAdjustments((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
      if (selectedPendingHostingId === request.id)
        setSelectedPendingHostingId(null);
    } catch (error) {
      showToast(
        error?.message || "Não foi possível aprovar a hospedagem.",
        "error",
      );
    } finally {
      setReviewingHostingRequestId(null);
    }
  }

  async function loadPixConfig() {
    setLoadingPixConfig(true);
    setPixConfigError("");
    try {
      const data = await api.get("/melpethostel/hospedagens/pix-config");
      const config = data?.config || {};
      setPixConfigForm({
        chavePix: config.chavePix || "",
        nomeRecebedor: config.nomeRecebedor || "Mel Pet Hostel",
        cidadeRecebedor: config.cidadeRecebedor || "SAO PAULO",
      });
    } catch (error) {
      setPixConfigError(
        error?.message || "Não foi possível carregar a configuração PIX.",
      );
    } finally {
      setLoadingPixConfig(false);
    }
  }

  async function savePixConfig(event) {
    event.preventDefault();
    if (!pixConfigForm.chavePix.trim()) {
      setPixConfigError("Informe a chave PIX.");
      return;
    }
    setSavingPixConfig(true);
    setPixConfigError("");
    try {
      const data = await api.post(
        "/melpethostel/hospedagens/pix-config",
        pixConfigForm,
      );
      const config = data?.config || pixConfigForm;
      setPixConfigForm({
        chavePix: config.chavePix || "",
        nomeRecebedor: config.nomeRecebedor || "Mel Pet Hostel",
        cidadeRecebedor: config.cidadeRecebedor || "SAO PAULO",
      });
      showToast("Configuração PIX salva com sucesso.", "success");
    } catch (error) {
      setPixConfigError(
        error?.message || "Não foi possível salvar a configuração PIX.",
      );
    } finally {
      setSavingPixConfig(false);
    }
  }

  function getPaymentCompetence(payment) {
    const explicitCompetence = String(
      payment?.mensalidadeCompetencia || "",
    ).trim();
    if (/^\d{4}-\d{2}$/.test(explicitCompetence)) return explicitCompetence;
    const type = String(payment?.parcelaTipo || "").toLowerCase();
    const match = type.match(/^mensal_(\d{4})_(\d{2})$/);
    return match ? `${match[1]}-${match[2]}` : "";
  }

  function getHostingPayments(request) {
    const payments =
      Array.isArray(request?.pagamentos) && request.pagamentos.length
        ? request.pagamentos
        : request?.pagamento
          ? [request.pagamento]
          : [];
    const order = { reserva: 1, checkin: 2, total: 3, cartao_credito: 4 };
    return [...payments].sort((a, b) => {
      const aCompetence = getPaymentCompetence(a);
      const bCompetence = getPaymentCompetence(b);
      if (aCompetence || bCompetence) {
        const aConfirmed =
          String(a?.status || "").toLowerCase() === "confirmado";
        const bConfirmed =
          String(b?.status || "").toLowerCase() === "confirmado";
        if (aConfirmed !== bConfirmed) return aConfirmed ? 1 : -1;
        return aCompetence.localeCompare(bCompetence);
      }
      const aType = String(a?.parcelaTipo || "total").toLowerCase();
      const bType = String(b?.parcelaTipo || "total").toLowerCase();
      return (order[aType] || 99) - (order[bType] || 99);
    });
  }

  function getHostingPaymentLabel(payment) {
    const type = String(payment?.parcelaTipo || "total").toLowerCase();
    if (type === "reserva") return "Pagamento da Reserva";
    if (type === "checkin") return "Pagamento de Check-in";
    const competence = getPaymentCompetence(payment);
    if (competence) {
      return `Mensalidade ${formatMonthlyCompetence(competence)}`;
    }
    if (type.startsWith("mensal_")) {
      const [, year, month] = type.match(/^mensal_(\d{4})_(\d{2})$/) || [];
      return year && month ? `Mensalidade ${month}/${year}` : "Mensalidade";
    }
    return "Pagamento Total";
  }

  function getVisibleHostingPayments(request) {
    const payments = getHostingPayments(request);
    if (!isMonthlyHostingRequest(request)) return payments;

    const confirmedCompetences = payments
      .filter(
        (payment) =>
          String(payment?.status || "").toLowerCase() === "confirmado" &&
          getPaymentCompetence(payment),
      )
      .map(getPaymentCompetence)
      .sort();
    const latestConfirmedCompetence = confirmedCompetences.at(-1) || "";

    return payments.filter((payment) => {
      const competence = getPaymentCompetence(payment);
      if (!competence || !latestConfirmedCompetence) return true;
      const status = String(payment?.status || "").toLowerCase();
      return status === "confirmado" || competence > latestConfirmedCompetence;
    });
  }

  function isMonthlyHostingRequest(request) {
    if (normalizeText(request?.modoCobranca) === "mensal") return true;
    return (request?.itens || []).some(
      (item) => normalizeText(item?.modoCobranca) === "mensal",
    );
  }
  function hasPendingHostingPayment(request) {
    if (getHostingRequestStatusTone(request?.status) !== "approved")
      return false;
    return getVisibleHostingPayments(request).some(
      (payment) => String(payment?.status || "").toLowerCase() !== "confirmado",
    );
  }

  function canChangeHostingPaymentOption(request) {
    if (getHostingRequestStatusTone(request?.status) !== "approved")
      return false;
    const payments = getVisibleHostingPayments(request);
    if (!payments.length) return false;
    return payments.every((payment) => {
      const status = String(payment?.status || "").toLowerCase();
      const hasReceipt = Boolean(
        payment?.comprovantePath || payment?.comprovanteNome,
      );
      return (
        !hasReceipt && !["confirmado", "comprovante_enviado"].includes(status)
      );
    });
  }

  function hasMonthlyCancellationRequested(request) {
    return (
      isMonthlyHostingRequest(request) &&
      getHostingPayments(request).some(
        (payment) => payment?.mensalidadeStatus === "cancelamento_solicitado",
      )
    );
  }
  function shouldShowHostingPaymentPanel(request, payments) {
    const requestTone = getHostingRequestStatusTone(request?.status);
    if (hasMonthlyCancellationRequested(request)) return false;
    if (!["approved", "confirmed"].includes(requestTone)) return false;
    if (!isMonthlyHostingRequest(request)) return true;
    if (!payments.length) return true;

    return payments.some(
      (payment) => String(payment?.status || "").toLowerCase() !== "confirmado",
    );
  }

  function formatMonthlyCompetence(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
    return match ? `${match[2]}/${match[1]}` : "mês vigente";
  }

  function getMonthlyPaymentCycleText(request, payment) {
    if (!isMonthlyHostingRequest(request)) return "";

    const competence = getPaymentCompetence(payment);
    const anchorDate = String(request?.criadoEm || "").slice(0, 10);
    const competenceMatch = competence.match(/^(\d{4})-(\d{2})$/);
    const anchorMatch = anchorDate.match(/^\d{4}-\d{2}-(\d{2})$/);
    if (!competenceMatch || !anchorMatch) return "";

    const year = Number(competenceMatch[1]);
    const month = Number(competenceMatch[2]);
    const anchorDay = Number(anchorMatch[1]);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const cycleDay = Math.min(anchorDay, lastDay);
    const cycleStart = new Date(Date.UTC(year, month - 1, cycleDay));
    const nextCycleStart = new Date(Date.UTC(year, month, cycleDay));
    nextCycleStart.setUTCDate(nextCycleStart.getUTCDate() - 1);

    return `Ciclo: ${formatBrazilDate(cycleStart.toISOString())} a ${formatBrazilDate(nextCycleStart.toISOString())}`;
  }
  function getMonthlyPayment(request) {
    return getVisibleHostingPayments(request).find(
      (payment) =>
        String(payment?.parcelaTipo || "").startsWith("mensal_") ||
        payment?.mensalidadeCompetencia,
    );
  }

  function getMonthlyCycleEndDate(
    request,
    payment = getMonthlyPayment(request),
  ) {
    const competence = getPaymentCompetence(payment) || request?.inicioMes;
    const anchorDate = String(request?.criadoEm || "").slice(0, 10);
    const competenceMatch = String(competence || "").match(/^(\d{4})-(\d{2})$/);
    const anchorMatch = anchorDate.match(/^\d{4}-\d{2}-(\d{2})$/);
    if (!competenceMatch || !anchorMatch) return "";

    const year = Number(competenceMatch[1]);
    const month = Number(competenceMatch[2]);
    const anchorDay = Number(anchorMatch[1]);
    const cycleStartDay = Math.min(
      anchorDay,
      new Date(Date.UTC(year, month, 0)).getUTCDate(),
    );
    const cycleEnd = new Date(Date.UTC(year, month, cycleStartDay));
    cycleEnd.setUTCDate(cycleEnd.getUTCDate() - 1);
    return cycleEnd.toISOString().slice(0, 10);
  }

  function getMonthlyValidityText(request) {
    const cycleEnd = getMonthlyCycleEndDate(request);
    return cycleEnd ? formatBrazilDate(cycleEnd) : "";
  }
  function isMonthlyCancellationStillValid(request) {
    const cycleEnd = getMonthlyCycleEndDate(request);
    if (!cycleEnd) return false;
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .reduce((date, part) => {
        if (
          part.type === "year" ||
          part.type === "month" ||
          part.type === "day"
        ) {
          date[part.type] = part.value;
        }
        return date;
      }, {});
    const todayKey = `${today.year}-${today.month}-${today.day}`;
    return todayKey <= cycleEnd;
  }
  function getMonthlyCancellationNotice(request) {
    const payment = getMonthlyPayment(request);
    if (payment?.mensalidadeStatus !== "cancelamento_solicitado") return "";
    const validUntil = getMonthlyValidityText(request);
    return `Pedido de cancelamento efetuado. Hospedagem válida até ${validUntil || "o fim do mês vigente"}`;
  }
  function formatHostingCheckInOut(request) {
    if (isMonthlyHostingRequest(request)) {
      const payment = getMonthlyPayment(request);
      return `Mês vigente: ${formatMonthlyCompetence(getPaymentCompetence(payment) || request?.inicioMes)}`;
    }
    if (request?.dataEntrada || request?.dataSaida) {
      return `Check-in: ${formatBrazilDate(request.dataEntrada)} · Check-out: ${formatBrazilDate(request.dataSaida)}`;
    }
    return formatHostingRequestPeriod(request);
  }

  function getHostingPaymentMessage(request) {
    const payments = getVisibleHostingPayments(request);
    if (
      getHostingRequestStatusTone(request?.status) === "confirmed" &&
      !isMonthlyHostingRequest(request)
    )
      return `Hospedagem Confirmada · ${formatHostingCheckInOut(request)}`;
    const reserve = payments.find(
      (payment) => payment.parcelaTipo === "reserva",
    );
    const checkin = payments.find(
      (payment) => payment.parcelaTipo === "checkin",
    );
    if (
      reserve?.status === "confirmado" &&
      checkin &&
      checkin.status !== "confirmado"
    ) {
      return "Pagamento da Reserva Realizada. Pagamento de check-in Pendente";
    }
    return "";
  }

  async function generateHostingPaymentOption(request, opcao) {
    const requestId = Number(request?.id);
    if (!requestId) return;
    setGeneratingHostingPaymentId(requestId);
    try {
      await api.post(
        `/melpethostel/hospedagens/solicitacoes/${requestId}/pagamento-opcao`,
        { opcao },
      );
      showToast(
        opcao === "cartao_credito"
          ? "Solicitação de link enviada aos administradores."
          : "Pagamento gerado com sucesso.",
        "success",
      );
      await loadHostingRequests();
    } catch (error) {
      showToast(
        error?.message || "Não foi possível gerar o pagamento.",
        "error",
      );
    } finally {
      setGeneratingHostingPaymentId(null);
    }
  }

  async function loadPendingCardPaymentRequests() {
    if (loadingCardPaymentRequests) return pendingCardPaymentRequests;
    setLoadingCardPaymentRequests(true);
    try {
      const data = await api.get(
        "/melpethostel/hospedagens/pagamentos/cartao/pendentes",
      );
      const solicitacoes = Array.isArray(data?.solicitacoes)
        ? data.solicitacoes
        : [];
      setPendingCardPaymentRequests(solicitacoes);
      return solicitacoes;
    } catch {
      setPendingCardPaymentRequests([]);
      return [];
    } finally {
      setLoadingCardPaymentRequests(false);
    }
  }

  async function sendCardPaymentLink(payment, request) {
    const paymentId = Number(payment?.id);
    const linkPagamento = String(cardPaymentLinks[paymentId] || "").trim();
    if (!paymentId) return;
    if (!linkPagamento) {
      showToast("Cole o link de pagamento.", "error");
      return;
    }
    setSendingCardPaymentLinkId(paymentId);
    try {
      const data = await api.patch(
        "/melpethostel/hospedagens/pagamentos/" + paymentId + "/link-pagamento",
        { linkPagamento },
      );
      showToast("Link de pagamento enviado com sucesso.", "success");
      if (data?.email && !data.email.sent) {
        showToast(
          "Link salvo, mas o e-mail não foi enviado. Verifique o SMTP.",
          "warning",
        );
      }
      setCardPaymentLinks((current) => ({ ...current, [paymentId]: "" }));
      await Promise.all([
        loadPendingCardPaymentRequests(),
        loadHostingRequests(),
      ]);
    } catch (error) {
      showToast(
        error?.message || "Não foi possível enviar o link de pagamento.",
        "error",
      );
    } finally {
      setSendingCardPaymentLinkId(null);
    }
  }

  async function loadPendingHostingCheckinRequests() {
    if (loadingHostingCheckinRequests) return pendingHostingCheckinRequests;
    setLoadingHostingCheckinRequests(true);
    try {
      const data = await api.get("/melpethostel/hospedagens/checkin/pendentes");
      const solicitacoes = Array.isArray(data?.solicitacoes)
        ? data.solicitacoes
        : [];
      setPendingHostingCheckinRequests(solicitacoes);
      return solicitacoes;
    } catch (error) {
      setPendingHostingCheckinRequests([]);
      showToast(
        error?.message || "Nao foi possivel carregar check-ins pendentes.",
        "error",
      );
      return [];
    } finally {
      setLoadingHostingCheckinRequests(false);
    }
  }

  function getCurrentCompetenceValue() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).formatToParts(now);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    return year && month ? `${year}-${month}` : "";
  }

  function formatPresenceCompetence(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
    return match ? `${match[2]}/${match[1]}` : "Mês";
  }

  function buildPresenceMonthOptions(pet) {
    const values = new Set([
      getCurrentCompetenceValue(),
      pet?.ultimaCompetencia,
    ]);
    return Array.from(values)
      .filter((value) => /^\d{4}-\d{2}$/.test(String(value || "")))
      .sort();
  }

  function shiftPresenceCompetence(direction) {
    const match = String(presenceCompetence || "").match(/^(\d{4})-(\d{2})$/);
    if (!match || !activePresencePetId) return;
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1 + direction,
      1,
    );
    const next = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    setPresenceCompetence(next);
    loadPresenceSummary(activePresencePetId, next);
  }

  function buildPresenceCalendarDays(cycleStart, cycleEnd) {
    const startMatch = String(cycleStart || "").match(
      /^(\d{4})-(\d{2})-(\d{2})$/,
    );
    const endMatch = String(cycleEnd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!startMatch || !endMatch) return [];

    const start = new Date(
      Number(startMatch[1]),
      Number(startMatch[2]) - 1,
      Number(startMatch[3]),
    );
    const end = new Date(
      Number(endMatch[1]),
      Number(endMatch[2]) - 1,
      Number(endMatch[3]),
    );
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start > end
    )
      return [];

    const firstWeekdayFromMonday = (start.getDay() + 6) % 7;
    const blanks = Array.from(
      { length: firstWeekdayFromMonday },
      (_, index) => ({
        key: `blank-${index}`,
        blank: true,
      }),
    );
    const days = [];
    const current = new Date(start);
    while (current <= end) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, "0");
      const day = String(current.getDate()).padStart(2, "0");
      days.push({
        key: `${year}-${month}-${day}`,
        day: Number(day),
        date: `${year}-${month}-${day}`,
      });
      current.setDate(current.getDate() + 1);
    }
    return [...blanks, ...days];
  }
  async function loadPresencePets(admin = false) {
    setLoadingPresence(true);
    try {
      const data = await api.get(
        admin
          ? "/melpethostel/presencas/admin/pets"
          : "/melpethostel/presencas/pets",
      );
      const pets = Array.isArray(data?.pets) ? data.pets : [];
      setPresencePets(pets);
      return pets;
    } catch (error) {
      showToast(
        error?.message || "Não foi possível carregar presenças.",
        "error",
      );
      return [];
    } finally {
      setLoadingPresence(false);
    }
  }

  async function loadPresenceSummary(petId, competence) {
    if (!petId || !competence) return;
    setLoadingPresence(true);
    try {
      const data = await api.get(
        `/melpethostel/presencas/pets/${petId}?competencia=${competence}`,
      );
      setPresenceSummary(data?.resumo || null);
    } catch (error) {
      setPresenceSummary(null);
      showToast(
        error?.message || "Não foi possível carregar o mês selecionado.",
        "error",
      );
    } finally {
      setLoadingPresence(false);
    }
  }

  function openPresencePet(pet) {
    const petId = Number(pet?.petId || pet?.id);
    const competence = pet?.ultimaCompetencia || getCurrentCompetenceValue();
    setActivePresencePetId(petId);
    setPresenceCompetence(competence);
    setPresenceViewMode("calendar");
    loadPresenceSummary(petId, competence);
  }

  async function togglePresenceDate(date) {
    if (!isAdmin || !activePresencePetId || !presenceCompetence || !date)
      return;
    setTogglingPresenceDate(date);
    try {
      const data = await api.post(
        `/melpethostel/presencas/pets/${activePresencePetId}/toggle`,
        { competencia: presenceCompetence, dataPresenca: date },
      );
      setPresenceSummary(data?.resumo || null);
    } catch (error) {
      showToast(
        error?.message || "Não foi possível alterar a presença.",
        "error",
      );
    } finally {
      setTogglingPresenceDate("");
    }
  }

  function savePresencePdf() {
    window.print();
  }
  async function confirmHostingCheckin(request) {
    if (!request?.id) return;
    setConfirmingHostingCheckinId(request.id);
    try {
      await api.patch(
        "/melpethostel/hospedagens/solicitacoes/" + request.id + "/checkin",
      );
      showToast("Check-in confirmado.", "success");
      setPendingHostingCheckinRequests((current) =>
        current.filter((item) => Number(item.id) !== Number(request.id)),
      );
      await loadHostingRequests();
    } catch (error) {
      showToast(
        error?.message || "Nao foi possivel confirmar o check-in.",
        "error",
      );
    } finally {
      setConfirmingHostingCheckinId(null);
    }
  }
  async function loadPendingHostingPaymentReceipts() {
    if (loadingHostingPaymentReceipts) return pendingHostingPaymentRequests;
    setLoadingHostingPaymentReceipts(true);
    try {
      const data = await api.get(
        "/melpethostel/hospedagens/comprovantes/pendentes",
      );
      const solicitacoes = Array.isArray(data?.solicitacoes)
        ? data.solicitacoes
        : [];
      setPendingHostingPaymentRequests(solicitacoes);
      return solicitacoes;
    } catch {
      setPendingHostingPaymentRequests([]);
      return [];
    } finally {
      setLoadingHostingPaymentReceipts(false);
    }
  }

  async function openHostingPaymentPreview(payment) {
    const paymentId = Number(payment?.id);
    if (!paymentId) return;
    const title = getHostingPaymentLabel(payment);
    try {
      const src =
        "/melpethostel/hospedagens/pagamentos/" + paymentId + "/preview";
      const data = await api.get(src);
      const contentType = String(data?.contentType || "application/pdf");
      setPaymentPreview({
        title,
        src,
        contentType,
        imageSrc: contentType.startsWith("image/")
          ? "data:" + contentType + ";base64," + data.base64
          : "",
      });
    } catch (error) {
      showToast(
        error?.message || "Não foi possível visualizar o comprovante.",
        "error",
      );
    }
  }

  function openRejectHostingPaymentModal(payment, request) {
    setRejectHostingPaymentTarget({ ...payment, requestId: request?.id });
    setRejectHostingPaymentReason("");
  }

  function closeRejectHostingPaymentModal() {
    if (approvingHostingPaymentId) return;
    setRejectHostingPaymentTarget(null);
    setRejectHostingPaymentReason("");
  }

  async function rejectHostingPaymentReceipt() {
    const payment = rejectHostingPaymentTarget;
    const paymentId = Number(payment?.id);
    const motivoRecusa = rejectHostingPaymentReason.trim();
    if (!paymentId) return;
    if (!motivoRecusa) {
      showToast("Informe o motivo da recusa.", "error");
      return;
    }
    setApprovingHostingPaymentId(paymentId);
    try {
      await api.patch(
        "/melpethostel/hospedagens/pagamentos/" + paymentId + "/reprovar",
        {
          motivoRecusa,
        },
      );
      showToast("Comprovante recusado com sucesso.", "success");
      closeRejectHostingPaymentModal();
      await Promise.all([
        loadPendingHostingPaymentReceipts(),
        loadHostingRequests(),
      ]);
    } catch (error) {
      showToast(
        error?.message || "Não foi possível recusar o comprovante.",
        "error",
      );
    } finally {
      setApprovingHostingPaymentId(null);
    }
  }
  async function approveHostingPaymentReceipt(payment) {
    const paymentId = Number(payment?.id);
    if (!paymentId) return;
    setApprovingHostingPaymentId(paymentId);
    try {
      await api.patch(
        `/melpethostel/hospedagens/pagamentos/${paymentId}/aprovar`,
        {},
      );
      showToast("Comprovante aprovado com sucesso.", "success");
      await Promise.all([
        loadPendingHostingRequests(),
        loadPendingHostingPaymentReceipts(),
      ]);
    } catch (error) {
      showToast(
        error?.message || "Não foi possível aprovar o comprovante.",
        "error",
      );
    } finally {
      setApprovingHostingPaymentId(null);
    }
  }
  async function copyHostingPixCode(code) {
    const text = String(code || "").trim();
    if (!text) return;
    try {
      if (navigator?.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      showToast("PIX copiado.", "success");
    } catch {
      showToast("Não foi possível copiar o PIX.", "error");
    }
  }
  function handleHostingPaymentFile(requestId, event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    setHostingPaymentFiles((current) => ({ ...current, [requestId]: file }));
  }

  async function uploadHostingPaymentReceipt(request) {
    const requestId = Number(request?.id);
    const parcelaTipo = request?.parcelaTipo || "total";
    const paymentKey = requestId + "-" + parcelaTipo;
    const file =
      hostingPaymentFiles[paymentKey] || hostingPaymentFiles[requestId];
    if (!requestId || !file) {
      showToast("Selecione o comprovante de pagamento.", "error");
      return;
    }
    setUploadingHostingPaymentId(requestId);
    try {
      const formData = new FormData();
      formData.append("arquivo", file);
      formData.append("parcelaTipo", parcelaTipo);
      await api.post(
        `/melpethostel/hospedagens/solicitacoes/${requestId}/comprovante`,
        formData,
      );
      setHostingPaymentFiles((current) => ({
        ...current,
        [paymentKey]: null,
        [requestId]: null,
      }));
      if (hostingPaymentFileRefs.current[paymentKey])
        hostingPaymentFileRefs.current[paymentKey].value = "";
      if (hostingPaymentFileRefs.current[requestId])
        hostingPaymentFileRefs.current[requestId].value = "";
      showToast("Comprovante enviado com sucesso.", "success");
      await loadHostingRequests();
    } catch (error) {
      showToast(
        error?.message || "Não foi possível enviar o comprovante.",
        "error",
      );
    } finally {
      setUploadingHostingPaymentId(null);
    }
  }
  async function rejectHostingRequest() {
    const request = rejectHostingTarget;
    const motivoRecusa = rejectHostingReason.trim();
    if (!request?.id) return;
    if (!motivoRecusa) {
      showToast("Informe o motivo da reprovação.", "error");
      return;
    }
    setReviewingHostingRequestId(request.id);
    try {
      await api.patch(
        "/melpethostel/hospedagens/solicitacoes/" + request.id + "/reprovar",
        { motivoRecusa },
      );
      showToast("Hospedagem reprovada.", "success");
      setPendingHostingRequests((current) =>
        current.filter((item) => Number(item.id) !== Number(request.id)),
      );
      setHostingApprovalAdjustments((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
      if (selectedPendingHostingId === request.id)
        setSelectedPendingHostingId(null);
      setRejectHostingTarget(null);
      setRejectHostingReason("");
    } catch (error) {
      showToast(
        error?.message || "Não foi possível reprovar a hospedagem.",
        "error",
      );
    } finally {
      setReviewingHostingRequestId(null);
    }
  }

  async function loadHostingRequests() {
    setLoadingHostingRequests(true);
    setHostingRequestsError("");

    try {
      const data = await api.get("/melpethostel/hospedagens/solicitacoes");
      setHostingRequests(
        Array.isArray(data?.solicitacoes) ? data.solicitacoes : [],
      );
    } catch (error) {
      setHostingRequests([]);
      setHostingRequestsError(
        error?.message || "Não foi possível carregar seus pedidos.",
      );
    } finally {
      setLoadingHostingRequests(false);
    }
  }

  async function savePlano(event) {
    event.preventDefault();
    setPlanosError("");

    if (!planoForm.tipo.trim()) {
      setPlanosError("Informe o tipo do plano.");
      return;
    }

    if (!planoForm.categoriaDe.trim()) {
      setPlanosError("Informe a categoria DE do plano.");
      return;
    }

    if (!planoForm.categoriaAte.trim()) {
      setPlanosError("Informe a categoria ATÉ do plano.");
      return;
    }

    if (!String(planoForm.tempoQuantidade || "").trim()) {
      setPlanosError("Informe a quantidade de tempo do plano.");
      return;
    }

    if (!planoForm.tempoUnidade.trim()) {
      setPlanosError("Informe o tempo do plano.");
      return;
    }

    if (!planoForm.valor.trim()) {
      setPlanosError("Informe o valor do plano.");
      return;
    }

    setSavingPlano(true);
    try {
      const data = editingPlanoId
        ? await api.put(`/melpethostel/planos/${editingPlanoId}`, planoForm)
        : await api.post("/melpethostel/planos", planoForm);
      if (data?.plano) {
        setPlanos((current) =>
          editingPlanoId
            ? current.map((item) =>
                Number(item.id) === Number(editingPlanoId) ? data.plano : item,
              )
            : [...current, data.plano],
        );
      } else {
        await loadPlanos();
      }
      setEditingPlanoId(null);
      setPlanoForm((current) => ({
        tipo: current.tipo,
        categoriaDe: "",
        categoriaAte: "",
        unidade: current.unidade,
        tipoCobranca: current.tipoCobranca,
        tipoCalculo: current.tipoCalculo,
        tempoQuantidade: current.tempoQuantidade,
        tempoUnidade: current.tempoUnidade,
        valor: "",
      }));
      showToast(
        editingPlanoId
          ? "Plano atualizado com sucesso."
          : "Categoria adicionada ao plano.",
        "success",
      );
    } catch (error) {
      setPlanosError(error?.message || "Não foi possível salvar o plano.");
    } finally {
      setSavingPlano(false);
    }
  }

  function startEditPlano(plano) {
    setEditingPlanoId(plano.id);
    setPlanosError("");
    setPlanoForm({
      tipo: plano.tipo || "",
      categoriaDe: plano.categoriaDe || "",
      categoriaAte: plano.categoriaAte || "",
      unidade: plano.unidade || "Kg",
      tipoCobranca: plano.tipoCobranca || "unico",
      tipoCalculo: plano.tipoCalculo || "pernoite",
      tempoQuantidade: String(plano.tempoQuantidade || "1"),
      tempoUnidade: plano.tempoUnidade || "dia",
      valor: maskCurrencyInput(
        String(Math.round(Number(plano.valor || 0) * 100)),
      ),
    });
  }

  function cancelEditPlano() {
    setEditingPlanoId(null);
    setPlanosError("");
    setPlanoForm({
      tipo: "",
      categoriaDe: "",
      categoriaAte: "",
      unidade: "Kg",
      tipoCobranca: "unico",
      tipoCalculo: "pernoite",
      tempoQuantidade: "1",
      tempoUnidade: "dia",
      valor: "",
    });
  }

  function togglePlanoTipo(tipo) {
    setOpenPlanoTipos((current) => ({
      ...current,
      [tipo]: !current[tipo],
    }));
  }

  function parsePlanNumber(value) {
    const match = String(value || "")
      .replace(",", ".")
      .match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function getHostingDaysBetween(entrada, saida, tipoCalculo = "pernoite") {
    if (!entrada || !saida) return 0;
    if (tipoCalculo === "dia_uso") return 1;
    const start = new Date(`${entrada}T00:00:00`);
    const end = new Date(`${saida}T00:00:00`);
    const diff = end.getTime() - start.getTime();
    if (!Number.isFinite(diff) || diff < 0) return 0;
    return Math.ceil(diff / 86400000);
  }

  function getPetPlansForType(pet, tipo) {
    const plansForType = planos.filter((plano) => plano.tipo === tipo);
    if (!plansForType.length) return [];

    return plansForType.filter((plano) => {
      const unidade = normalizeText(plano.unidade || "");
      const petValue = unidade.includes("ano")
        ? calculatePetAgeYears(pet?.dataNascimento)
        : parsePlanNumber(pet?.pesoAproximado);
      const min = parsePlanNumber(plano.categoriaDe);
      const max = parsePlanNumber(plano.categoriaAte);
      if (petValue === null || min === null || max === null) return false;
      return petValue >= min && petValue <= max;
    });
  }

  function getPetPlanValue(pet, tipo, planoId = null) {
    const plansForPet = getPetPlansForType(pet, tipo);
    if (!plansForPet.length) return null;
    if (planoId) {
      return (
        plansForPet.find((plano) => Number(plano.id) === Number(planoId)) ||
        null
      );
    }
    return plansForPet.length === 1 ? plansForPet[0] : null;
  }

  function getDefaultUniquePlan(pet, tipo) {
    return (
      getPetPlansForType(pet, tipo).find(
        (plano) => getPlanBillingMode(plano) === "unico",
      ) || null
    );
  }

  function getMonthlyPlans(pet, tipo) {
    return getPetPlansForType(pet, tipo).filter(
      (plano) => getPlanBillingMode(plano) === "mensal",
    );
  }

  function getPlanDailyValue(plano) {
    const valor = Number(plano?.valor || 0);
    const quantidade = Number(plano?.tempoQuantidade || 1);
    const tempo = normalizeText(plano?.tempoUnidade || "dia");
    if (!Number.isFinite(valor) || valor <= 0) return 0;
    if (!Number.isFinite(quantidade) || quantidade <= 0) return valor;
    return tempo.includes("dia") ? valor / quantidade : valor;
  }

  function getPlanBillingMode(plano) {
    return plano?.tipoCobranca === "mensal" ? "mensal" : "unico";
  }

  function isRecurringPlan(plano) {
    return getPlanBillingMode(plano) === "mensal";
  }

  function isDayUsePlan(plano) {
    return plano?.tipoCalculo === "dia_uso";
  }

  function getStartMonthDate(value) {
    return value ? `${value}-01` : "";
  }

  function formatStartMonth(value) {
    if (!value) return "";
    const [year, month] = String(value).split("-");
    if (!year || !month) return value;
    return `${month}/${year.slice(-2)}`;
  }

  function formatPlanTempo(plano) {
    const quantidade = Number(plano?.tempoQuantidade || 1);
    return `${Math.max(1, Math.trunc(quantidade || 1))} ${plano?.tempoUnidade || "dia"}`;
  }

  function formatTipoCalculo(plano) {
    return plano?.tipoCalculo === "dia_uso" ? "Dia de uso" : "Pernoite";
  }

  function toggleHostingPet(petId) {
    setHostingPetIds((current) => {
      if (current.includes(petId)) {
        setHostingPetPeriods((periods) => {
          const next = { ...periods };
          delete next[petId];
          return next;
        });
        return current.filter((id) => id !== petId);
      }

      setHostingPetPeriods((periods) => ({
        ...periods,
        [petId]: {
          tipo: "",
          planoId: "",
          entrada: "",
          saida: "",
          dataUso: "",
          inicioMes: "",
        },
      }));
      return [...current, petId];
    });
  }

  function updateHostingPetPeriod(petId, field, value) {
    setHostingPetPeriods((current) => ({
      ...current,
      [petId]: {
        ...(current[petId] || {}),
        [field]: value,
        ...(field === "tipo"
          ? { planoId: "", entrada: "", saida: "", dataUso: "", inicioMes: "" }
          : {}),
        ...(field === "planoId"
          ? { entrada: "", saida: "", dataUso: "", inicioMes: "" }
          : {}),
      },
    }));
  }

  function clearHostingRequest() {
    setHostingPetIds([]);
    setHostingPetPeriods({});
  }

  async function sendHostingRequest() {
    if (!hostingItems.length) {
      showToast("Selecione pelo menos um pet aprovado.", "error");
      return;
    }
    const itemWithoutType = hostingItems.find((item) => !item.tipo);
    if (itemWithoutType) {
      showToast(
        `Selecione o tipo de hospedagem para ${itemWithoutType.pet.nome}.`,
        "error",
      );
      return;
    }
    const itemWithoutPlan = hostingItems.find((item) => !item.plano);
    if (itemWithoutPlan) {
      const availablePlans = itemWithoutPlan.tipo
        ? getPetPlansForType(itemWithoutPlan.pet, itemWithoutPlan.tipo)
        : [];
      const monthlyPlans = itemWithoutPlan.tipo
        ? getMonthlyPlans(itemWithoutPlan.pet, itemWithoutPlan.tipo)
        : [];
      showToast(
        monthlyPlans.length
          ? `Selecione o plano para ${itemWithoutPlan.pet.nome}.`
          : availablePlans.length
            ? `Não existe plano único compatível para ${itemWithoutPlan.pet.nome}.`
            : `Não existe plano compatível para ${itemWithoutPlan.pet.nome}.`,
        "error",
      );
      return;
    }
    const itemWithoutPeriod = hostingItems.find((item) =>
      item.recurring ? !item.inicioMes || !item.quantity : !item.days,
    );
    if (itemWithoutPeriod) {
      showToast(
        itemWithoutPeriod.recurring
          ? `Informe quantidade e mês de início para ${itemWithoutPeriod.pet.nome}.`
          : itemWithoutPeriod.dayUse
            ? `Informe a data de utilização para ${itemWithoutPeriod.pet.nome}.`
            : `Informe entrada e saída válidas para ${itemWithoutPeriod.pet.nome}.`,
        "error",
      );
      return;
    }

    setSendingHostingRequest(true);
    try {
      const tiposSelecionados = Array.from(
        new Set(hostingItems.map((item) => item.tipo).filter(Boolean)),
      );
      const modosSelecionados = Array.from(
        new Set(hostingItems.map((item) => item.billingMode).filter(Boolean)),
      );
      await api.post("/melpethostel/hospedagens/solicitacoes", {
        tipo:
          tiposSelecionados.length === 1 ? tiposSelecionados[0] : "Múltiplos",
        modoCobranca:
          modosSelecionados.length === 1 ? modosSelecionados[0] : "misto",
        inicioMes:
          hostingItems
            .map((item) => item.inicioMes)
            .filter(Boolean)
            .sort()[0] || "",
        dataEntrada: hostingItems
          .map((item) => item.entrada)
          .filter(Boolean)
          .sort()[0],
        dataSaida:
          hostingItems
            .map((item) => item.saida)
            .filter(Boolean)
            .sort()
            .at(-1) || null,
        dias: Math.max(...hostingItems.map((item) => item.days)),
        total: hostingTotal,
        itens: hostingItems.map((item) => ({
          petId: item.pet.id,
          petNome: item.pet.nome,
          planoId: item.plano.id,
          tipo: item.tipo,
          modoCobranca: item.billingMode,
          quantidadeSolicitada: item.quantity,
          tempoQuantidade: item.quantity,
          tempoUnidade: item.plano.tempoUnidade || "dia",
          inicioMes: item.inicioMes,
          dataEntrada: item.entrada,
          dataSaida: item.saida,
          dias: item.days,
          valorDiaria: item.dailyValue,
          valorTotal: item.total,
        })),
      });
      await loadHostingRequests();
      showToast("Solicitação de hospedagem enviada.", "success");
      clearHostingRequest();
      setActiveHostingMenu("");
    } catch (error) {
      showToast(
        error?.message || "Não foi possível enviar a solicitação.",
        "error",
      );
    } finally {
      setSendingHostingRequest(false);
    }
  }

  async function loadVaccineConfigItems() {
    setLoadingVaccineConfig(true);
    setVaccineConfigError("");
    try {
      const data = await api.get("/melpethostel/pets/vacinas-config");
      setVaccineConfigItems(Array.isArray(data?.itens) ? data.itens : []);
    } catch (error) {
      setVaccineConfigItems([]);
      setVaccineConfigError(
        error?.message || "Não foi possível carregar vacinas / outros.",
      );
    } finally {
      setLoadingVaccineConfig(false);
    }
  }

  function resetVaccineConfigForm() {
    setEditingVaccineConfigId(null);
    setVaccineConfigForm({
      descricao: "",
      obrigatorio: false,
      tipos: [],
      tipoAtual: "",
      tipoDuracaoAtual: "",
    });
    setVaccineConfigError("");
  }

  function addVaccineConfigType() {
    const descricao = vaccineConfigForm.tipoAtual.trim();
    const duracao = vaccineConfigForm.tipoDuracaoAtual.trim();
    if (!descricao || !duracao) {
      setVaccineConfigError("Informe o tipo e a duração em meses.");
      return;
    }

    setVaccineConfigForm((current) => ({
      ...current,
      tipoAtual: "",
      tipoDuracaoAtual: "",
      tipos: normalizeVaccineTypes([
        ...(current.tipos || []),
        { descricao, duracao },
      ]),
    }));
    setVaccineConfigError("");
  }

  function removeVaccineConfigType(value) {
    const descricao = normalizeVaccineType(value).descricao;
    setVaccineConfigForm((current) => ({
      ...current,
      tipos: normalizeVaccineTypes(current.tipos).filter(
        (item) => item.descricao !== descricao,
      ),
    }));
  }

  function startEditVaccineConfig(item) {
    setEditingVaccineConfigId(item.id);
    setVaccineConfigForm({
      descricao: item.descricao || "",
      obrigatorio: Boolean(item.obrigatorio),
      tipos: normalizeVaccineTypes(item.tipos, item.duracao),
      tipoAtual: "",
      tipoDuracaoAtual: "",
    });
    setVaccineConfigError("");
  }

  function startDeleteVaccineConfig(item) {
    setVaccineConfigError("");
    setDeleteWarningVaccineConfig(item);
    setConfirmDeleteVaccineConfigId(null);
  }

  function acknowledgeDeleteVaccineConfig(item) {
    setDeleteWarningVaccineConfig(null);
    setConfirmDeleteVaccineConfigId(item.id);
  }

  function cancelDeleteVaccineConfig() {
    setDeleteWarningVaccineConfig(null);
    setConfirmDeleteVaccineConfigId(null);
  }

  async function saveVaccineConfig(event) {
    event?.preventDefault();
    const payload = {
      descricao: vaccineConfigForm.descricao.trim(),
      tipos: normalizeVaccineTypes(vaccineConfigForm.tipos),
      obrigatorio: vaccineConfigForm.obrigatorio,
      ativo: true,
    };

    if (!payload.descricao) {
      setVaccineConfigError("Descrição é obrigatória.");
      return;
    }

    if (!payload.tipos.length) {
      setVaccineConfigError("Informe pelo menos um tipo.");
      return;
    }

    setSavingVaccineConfig(true);
    setVaccineConfigError("");
    try {
      if (editingVaccineConfigId) {
        await api.put(
          `/melpethostel/pets/vacinas-config/${editingVaccineConfigId}`,
          payload,
        );
        showToast("Configuração atualizada com sucesso.", "success");
      } else {
        await api.post("/melpethostel/pets/vacinas-config", payload);
        showToast("Configuração salva com sucesso.", "success");
      }

      resetVaccineConfigForm();
      await loadVaccineConfigItems();
    } catch (error) {
      setVaccineConfigError(error?.message || "Não foi possível salvar.");
    } finally {
      setSavingVaccineConfig(false);
    }
  }

  async function deleteVaccineConfig(item) {
    if (!item?.id || deletingVaccineConfigId) return;

    setDeletingVaccineConfigId(item.id);
    setVaccineConfigError("");
    try {
      await api.delete(`/melpethostel/pets/vacinas-config/${item.id}`);
      if (editingVaccineConfigId === item.id) {
        resetVaccineConfigForm();
      }
      cancelDeleteVaccineConfig();
      showToast("Configuração excluída com sucesso.", "success");
      await loadVaccineConfigItems();
    } catch (error) {
      setVaccineConfigError(error?.message || "Não foi possível excluir.");
    } finally {
      setDeletingVaccineConfigId(null);
    }
  }

  async function loadPetStatusSearch(event) {
    event?.preventDefault();
    setPetStatusSubmitted(true);
    setLoadingPetStatus(true);
    setPetStatusError("");

    try {
      const params = ["ordenar=nome_asc"];
      const trimmedSearch = petStatusSearchTerm.trim();
      if (trimmedSearch) {
        params.push(`busca=${encodeURIComponent(trimmedSearch)}`);
      }

      const data = await api.get(`/melpethostel/clientes?${params.join("&")}`);
      setPetStatusResults(Array.isArray(data?.clientes) ? data.clientes : []);
    } catch (error) {
      setPetStatusResults([]);
      setPetStatusError(error?.message || "Erro ao pesquisar pets.");
    } finally {
      setLoadingPetStatus(false);
    }
  }

  function resetAdminPetSearch() {
    setPetStatusSearchTerm("");
    setPetStatusResults([]);
    setPetStatusSubmitted(false);
    setPetStatusError("");
    setSelectedAdminPet(null);
    setSelectedPet(null);
    setPetDocsPet(null);
    setPetFormMode("list");
    setPetVaccineFiles({ frente: null, verso: null });
    setUploadedPetVaccineSides({ frente: false, verso: false });
    setPetVaccineResponses({});
    setPetVaccineResponsesSaved(false);
    setEditingAdminPetVaccines(false);
  }

  function buildAdminPetFicha(cliente, pet) {
    return {
      ...pet,
      clienteId: cliente?.id,
      tutorNome: cliente?.nome || "",
      tutorCpf: cliente?.cpf || "",
      tutorRg: cliente?.rg || "",
      tutorTelefone: cliente?.telefone || cliente?.whatsapp || "",
      ficha: pet?.ficha || {},
      carteiras: Array.isArray(pet?.carteiras) ? pet.carteiras : [],
    };
  }

  async function refreshAdminPetVaccineInfo(pet = petDocsPet) {
    if (!pet?.id || !pet?.clienteId) return;

    setLoadingVaccineCardInfo(true);
    setVaccineCardInfoError("");
    try {
      const data = await api.get(
        `/melpethostel/pets/${pet.id}/carteira-vacinacao/info?clienteId=${encodeURIComponent(pet.clienteId)}`,
      );
      const carteiras = Array.isArray(data?.carteiras) ? data.carteiras : [];
      const itens = Array.isArray(data?.itens) ? data.itens : [];
      const fichaAtualizada = { ...pet, carteiras };
      setSelectedAdminPet((current) =>
        current?.id === pet.id ? { ...current, carteiras } : current,
      );
      setSelectedPet(fichaAtualizada);
      setPetDocsPet(fichaAtualizada);
      setUploadedPetVaccineSides({
        frente: getSubmittedPetCarteiras({ carteiras }).some(
          (carteira) => carteira.lado === "frente",
        ),
        verso: getSubmittedPetCarteiras({ carteiras }).some(
          (carteira) => carteira.lado === "verso",
        ),
      });
      setVaccineCardItems(itens);
      setPetVaccineResponses(
        itens.reduce(
          (acc, item) => ({
            ...acc,
            [item.configId]: {
              valor: item.tipo || "",
              dataAplicacao: String(item.dataAplicacao || "").slice(0, 10),
            },
          }),
          {},
        ),
      );
    } catch (error) {
      setUploadedPetVaccineSides({ frente: false, verso: false });
      setPetVaccineResponses({});
      setVaccineCardInfoError(
        error?.message || "Nao foi possivel carregar os dados do pet.",
      );
    } finally {
      setLoadingVaccineCardInfo(false);
    }
  }

  async function handleOpenAdminPetFicha(cliente, pet) {
    const ficha = buildAdminPetFicha(cliente, pet);

    setSelectedAdminPet(ficha);
    setSelectedPet(ficha);
    setPetDocsPet(ficha);
    setPetFormMode("vaccineUpload");
    setPetVaccineFiles({ frente: null, verso: null });
    setVaccineCardItems([]);
    setVaccineCardInfoError("");
    await loadPetVaccineConfigs();
    await refreshAdminPetVaccineInfo(ficha);
  }

  function clearAdminPetFicha() {
    setSelectedAdminPet(null);
    setSelectedPet(null);
    setPetDocsPet(null);
    setPetFormMode("list");
    setPetVaccineFiles({ frente: null, verso: null });
    setUploadedPetVaccineSides({ frente: false, verso: false });
    setPetVaccineResponses({});
  }

  function handleBackToAdminPetSearch() {
    clearAdminPetFicha();
    if (initialAdminPet?.source === "tutorMaintenance") {
      onBackToInitialAdminPetSource?.();
    }
  }

  function updatePetStatusInResults(petId, ativo) {
    setPetStatusResults((current) =>
      current.map((cliente) => ({
        ...cliente,
        pets: (cliente.pets || []).map((pet) =>
          Number(pet.id) === Number(petId) ? { ...pet, ativo } : pet,
        ),
      })),
    );
  }

  async function toggleAdminPetStatus(pet) {
    if (!pet?.id || savingPetStatusId) return;

    const nextActive = !pet.ativo;
    setSavingPetStatusId(pet.id);
    try {
      await api.patch(`/melpethostel/pets/${pet.id}/status`, {
        ativo: nextActive,
      });
      updatePetStatusInResults(pet.id, nextActive);
      showToast(
        nextActive ? "Pet ativado com sucesso." : "Pet inativado com sucesso.",
        "success",
      );
    } catch (error) {
      showToast(
        error?.message || "Não foi possível alterar a situação do pet.",
        "error",
      );
    } finally {
      setSavingPetStatusId(null);
    }
  }

  function formatAddress(endereco = {}) {
    return [
      endereco.logradouro,
      endereco.numero,
      endereco.complemento,
      endereco.bairro,
      endereco.cidade,
      endereco.uf || endereco.estado,
      endereco.cep,
    ]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(", ");
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
    if (activeMenu !== "aprovarCarteiraVacinacao") return;
    loadPendingVaccineCards();
  }, [isAdmin, activeMenu]);

  useEffect(() => {
    if (!isAdmin) return;
    if (activeMenu !== "vacinasOutros") return;
    loadVaccineConfigItems();
  }, [isAdmin, activeMenu]);

  useEffect(() => {
    if (!isAdmin) return;
    if (activeMenu !== "controlePlanos") return;
    loadPlanos();
  }, [isAdmin, activeMenu]);

  useEffect(() => {
    if (isAdmin || !["hospedagem", "extratoPagamentos"].includes(userMenu))
      return;
    loadPlanos();
  }, [isAdmin, userMenu]);
  useEffect(() => {
    if (isAdmin || userMenu !== "controlePresenca") return;
    setActivePresencePetId(null);
    setPresenceSummary(null);
    loadPresencePets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, userMenu]);

  useEffect(() => {
    if (isAdmin || !["hospedagem", "extratoPagamentos"].includes(userMenu))
      return;
    loadHostingRequests();
  }, [isAdmin, userMenu]);

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
            error?.message || "Não foi possível carregar os pets cadastrados.",
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

  useEffect(() => {
    if (isAdmin || !petRegistrationOnly) return;

    let ignore = false;

    (async () => {
      try {
        const data = await api.get("/melpethostel/pets/onboarding-status");
        if (ignore || data?.complete || !data?.pendingPet?.id) return;

        const pendingPet = {
          id: data.pendingPet.id,
          nome: data.pendingPet.nome,
          raca: data.pendingPet.raca,
          dataNascimento: data.pendingPet.dataNascimento || "",
          pesoAproximado: data.pendingPet.pesoAproximado,
          sexo: data.pendingPet.sexo || data.pendingPet.ficha?.sexo || "",
          ficha: {
            ...(data.pendingPet.ficha || {}),
            sexo: data.pendingPet.ficha?.sexo || data.pendingPet.sexo || "",
          },
        };

        setPetDocsPet(pendingPet);
        setSelectedPet(pendingPet);
        setPetFormMode("vaccineUpload");
        setPetVaccineConfigs(Array.isArray(data.configs) ? data.configs : []);
        const activeCarteiras = getCurrentPetCarteiras(data);
        setUploadedPetVaccineSides({
          frente: activeCarteiras.some((item) => item.lado === "frente"),
          verso: activeCarteiras.some((item) => item.lado === "verso"),
        });
        setPetVaccineResponses(
          (Array.isArray(data.respostas) ? data.respostas : []).reduce(
            (acc, item) => ({
              ...acc,
              [item.configId]: {
                valor: item.valor || "",
                dataAplicacao: item.dataAplicacao || "",
              },
            }),
            {},
          ),
        );
      } catch (error) {
        showToast(
          error?.message || "Não foi possível carregar a etapa do pet.",
          "error",
        );
      }
    })();

    return () => {
      ignore = true;
    };
  }, [isAdmin, petRegistrationOnly, showToast]);

  useEffect(() => {
    if (!petDocsPet?.id || petDocsPet?.ficha?.sexo || petDocsPet?.sexo) return;

    const registeredPet = registeredPets.find(
      (pet) => String(pet.id) === String(petDocsPet.id),
    );
    const sexo = registeredPet?.ficha?.sexo || registeredPet?.sexo || "";
    if (!sexo) return;

    setPetDocsPet((current) =>
      current?.id
        ? {
            ...current,
            sexo,
            ficha: {
              ...(current.ficha || {}),
              sexo,
            },
          }
        : current,
    );
  }, [petDocsPet, registeredPets]);

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

  async function handlePetRegistrationSubmit(payload) {
    const data = await api.post("/melpethostel/pets", payload);
    const pet = data?.pet;
    const createdAt = pet?.cadastradoEm || new Date().toISOString();
    const createdPet = {
      id: pet?.id || `${createdAt}-${payload.nomePet}`,
      nome: pet?.nome || payload.nomePet,
      raca: pet?.raca || payload.raca,
      dataNascimento: pet?.dataNascimento || payload.dataNascimento || "",
      pesoAproximado: pet?.pesoAproximado || payload.pesoAproximado,
      sexo: pet?.sexo || pet?.ficha?.sexo || payload.sexo || "",
      carteiras: [],
      cadastradoEm: createdAt,
      ficha: {
        ...(pet?.ficha || payload),
        sexo: pet?.ficha?.sexo || pet?.sexo || payload.sexo || "",
      },
    };
    setRegisteredPets((current) => [createdPet, ...current]);
    setSelectedPet(createdPet);
    setPetDocsPet(createdPet);
    setPetVaccineResponses({});
    setPetVaccineResponsesSaved(false);
    setPetVaccineFiles({ frente: null, verso: null });
    setUploadedPetVaccineSides({ frente: false, verso: false });
    setPetFormMode("vaccineUpload");
    await loadPetVaccineConfigs();
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

  function openDeletePetModal(pet) {
    if (!pet?.id || deletingPetId) return;
    setPendingDeletePet(pet);
  }

  function closeDeletePetModal() {
    if (deletingPetId) return;
    setPendingDeletePet(null);
  }

  async function confirmDeletePet() {
    const pet = pendingDeletePet;
    if (!pet?.id || deletingPetId) return;

    setDeletingPetId(pet.id);
    try {
      await api.delete(`/melpethostel/pets/${pet.id}`);
      setRegisteredPets((current) =>
        current.filter((item) => Number(item.id) !== Number(pet.id)),
      );
      if (selectedPet?.id === pet.id) setSelectedPet(null);
      if (petDocsPet?.id === pet.id) setPetDocsPet(null);
      setPetFormMode("list");
      setPendingDeletePet(null);
      showToast("Pet excluído com sucesso.", "success");
    } catch (error) {
      showToast(error?.message || "Não foi possível excluir o pet.", "error");
    } finally {
      setDeletingPetId(null);
    }
  }

  async function openVaccineCardInfo(pet) {
    const status = getPetVaccineStatus(pet);
    const targetMode = status.tone === "approved" ? "vaccine" : "vaccineUpload";
    const isSamePet = selectedPet?.id === pet.id && petFormMode === targetMode;
    if (isSamePet) {
      closeVaccineCardInfo();
      return;
    }

    setSelectedPet(pet);
    setPetFormMode(targetMode);
    setPetDocsPet(pet);
    setPetVaccineFiles({ frente: null, verso: null });
    setPetVaccineResponsesSaved(false);
    const activeCarteiras = getCurrentPetCarteiras(pet);
    const hasUploadedVaccineSides = {
      frente: activeCarteiras.some((item) => item.lado === "frente"),
      verso: activeCarteiras.some((item) => item.lado === "verso"),
    };
    setUploadedPetVaccineSides(hasUploadedVaccineSides);

    if (targetMode === "vaccineUpload") {
      setVaccineCardItems([]);
      setVaccineCardInfoError("");
      await loadPetVaccineConfigs();
      try {
        const data = await api.get(
          `/melpethostel/pets/${pet.id}/carteira-vacinacao/info`,
        );
        const respostas = Array.isArray(data?.itens) ? data.itens : [];
        const hasSavedVaccineResponses = respostas.some(
          (item) => item?.tipo && item?.dataAplicacao,
        );
        setPetVaccineResponsesSaved(
          Boolean(
            hasUploadedVaccineSides.frente &&
            hasUploadedVaccineSides.verso &&
            hasSavedVaccineResponses,
          ),
        );
        setPetVaccineResponses(
          respostas.reduce(
            (acc, item) => ({
              ...acc,
              [item.configId]: {
                valor: item.tipo || "",
                dataAplicacao: String(item.dataAplicacao || "").slice(0, 10),
              },
            }),
            {},
          ),
        );
      } catch {
        setPetVaccineResponses({});
        setPetVaccineResponsesSaved(false);
      }
      return;
    }

    setVaccineCardItems([]);
    setVaccineCardInfoError("");
    setLoadingVaccineCardInfo(true);
    try {
      const data = await api.get(
        `/melpethostel/pets/${pet.id}/carteira-vacinacao/info`,
      );
      setVaccineCardItems(Array.isArray(data?.itens) ? data.itens : []);
    } catch (error) {
      setVaccineCardInfoError(
        error?.message || "Não foi possível carregar a carteira de vacinação.",
      );
    } finally {
      setLoadingVaccineCardInfo(false);
    }
  }

  function closeVaccineCardInfo() {
    setVaccineCardItems([]);
    setVaccineCardInfoError("");
    setSelectedPet(null);
    setPetDocsPet(null);
    setPetFormMode("list");
  }

  function handleClosePetForm() {
    setSelectedPet(null);
    setPetFormMode(petCadastroObrigatorio ? "new" : "list");
  }

  function handleBackToMainMenu() {
    handleClosePetForm();
    onBack?.();
  }

  function handleBackToPetAdminMenu() {
    handleClosePetForm();
    setSelectedVaccineUser(null);
    setSelectedAdminPet(null);
    setPetDocsPet(null);
    setActiveMenu("cadastroPets");
  }

  function handleBackFromPetAdminMenu() {
    if (
      [
        "pesquisarPets",
        "aprovarCarteiraVacinacao",
        "vacinasOutros",
        "ativarInativarPet",
      ].includes(activeMenu)
    ) {
      handleMelPetBack("petAdminMenu");
      return;
    }

    handleMelPetBack("main");
  }

  function handleMelPetBack(origin = "main") {
    const backNavigationMatrix = {
      main: handleBackToMainMenu,
      petAdminMenu: handleBackToPetAdminMenu,
      adminPetSearch: handleBackToAdminPetSearch,
    };

    (backNavigationMatrix[origin] || backNavigationMatrix.main)();
  }

  async function loadPetVaccineConfigs() {
    try {
      const data = await api.get("/melpethostel/pets/vacinas-config");
      setPetVaccineConfigs(Array.isArray(data?.itens) ? data.itens : []);
    } catch (error) {
      showToast(
        error?.message || "Não foi possível carregar vacinas e outros.",
        "error",
      );
    }
  }

  function getPetGenderText(pet) {
    const sexo = normalizeText(pet?.ficha?.sexo || pet?.sexo || "");
    if (sexo.includes("femea") || sexo.includes("feminino") || sexo === "f") {
      return "da Pequena";
    }
    return "do Pequeno";
  }

  function handlePetVaccineFile(side, event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (
      !String(file.name || "")
        .toLowerCase()
        .endsWith(".pdf")
    ) {
      showToast("Selecione um arquivo PDF.", "error");
      return;
    }
    setPetVaccineFiles((current) => ({ ...current, [side]: file }));
  }

  function openPetVaccineFilePicker(side) {
    petVaccineFileRefs.current[side]?.click();
  }

  function clearPetVaccineFile(side) {
    setPetVaccineFiles((current) => ({ ...current, [side]: null }));
    if (petVaccineFileRefs.current[side]) {
      petVaccineFileRefs.current[side].value = "";
    }
  }

  function handlePetVaccinePrimaryAction(side) {
    if (uploadedPetVaccineSides[side]) return;
    if (petVaccineFiles[side]) {
      uploadPetVaccineCard(side);
      return;
    }
    openPetVaccineFilePicker(side);
  }

  async function uploadPetVaccineCard(side) {
    const pet = petDocsPet;
    const file = petVaccineFiles[side];
    if (!pet?.id || !file || uploadingPetVaccineSide) return;

    setUploadingPetVaccineSide(side);
    try {
      const formData = new FormData();
      formData.append("arquivo", file);
      formData.append("lado", side);
      if (isAdmin && pet.clienteId) {
        formData.append("clienteId", String(pet.clienteId));
        formData.append("tipoUpload", "carteira");
        formData.append("petId", String(pet.id));
      }
      const uploadUrl =
        isAdmin && pet.clienteId
          ? `${String(API_URL).replace(/\/+$/, "")}/melpethostel/documentos/admin-upload`
          : `${String(API_URL).replace(/\/+$/, "")}/melpethostel/pets/${encodeURIComponent(pet.id)}/carteira-vacinacao/upload`;
      await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
        body: formData,
      }).then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.status === "erro") {
          throw new Error(data?.mensagem || "Falha no upload da carteirinha.");
        }
        if (data?.carteira) {
          setRegisteredPets((current) =>
            current.map((item) =>
              Number(item.id) === Number(pet.id)
                ? {
                    ...item,
                    carteiras: [
                      ...(Array.isArray(item.carteiras)
                        ? item.carteiras
                        : []
                      ).filter((carteira) => carteira.lado !== side),
                      data.carteira,
                    ],
                  }
                : item,
            ),
          );
          setPetDocsPet((current) =>
            current?.id === pet.id
              ? {
                  ...current,
                  carteiras: [
                    ...(Array.isArray(current.carteiras)
                      ? current.carteiras
                      : []
                    ).filter((carteira) => carteira.lado !== side),
                    data.carteira,
                  ],
                }
              : current,
          );
        }
      });
      setUploadedPetVaccineSides((current) => ({ ...current, [side]: true }));
      setPetVaccineResponsesSaved(false);
      clearPetVaccineFile(side);
      showToast("Carteirinha enviada com sucesso.", "success");
    } catch (error) {
      showToast(
        error?.message || "Não foi possível enviar a carteirinha.",
        "error",
      );
    } finally {
      setUploadingPetVaccineSide("");
    }
  }

  function updatePetVaccineResponse(configId, field, value) {
    setPetVaccineResponses((current) => ({
      ...current,
      [configId]: {
        ...(current[configId] || {}),
        [field]: value,
      },
    }));
  }

  async function savePetVaccineResponses() {
    if (!petDocsPet?.id) return;
    if (!uploadedPetVaccineSides.frente || !uploadedPetVaccineSides.verso) {
      showToast(
        "Envie a frente e o verso da carteirinha de vacinação antes de concluir.",
        "error",
      );
      return;
    }

    const respostas = petVaccineConfigs
      .map((config) => ({
        configId: config.id,
        valor: petVaccineResponses[config.id]?.valor || "",
        dataAplicacao: petVaccineResponses[config.id]?.dataAplicacao || "",
      }))
      .filter((item) => item.valor && item.dataAplicacao);

    const missingRequired = petVaccineConfigs.find((config) => {
      const required =
        config.obrigatorio ||
        String(config.descricao || "")
          .toLowerCase()
          .includes("escudo protetor");
      if (!required) return false;
      const response = petVaccineResponses[config.id] || {};
      return !response.valor || !response.dataAplicacao;
    });

    if (missingRequired) {
      showToast(
        `Preencha ${missingRequired.descricao} e a data de aplicação.`,
        "error",
      );
      return;
    }

    setSavingPetVaccines(true);
    try {
      await api.post(`/melpethostel/pets/${petDocsPet.id}/vacinas-respostas`, {
        clienteId: petDocsPet.clienteId,
        respostas,
      });
      setPetVaccineResponsesSaved(true);
      showToast("Vacinas e outros salvos com sucesso.", "success");
      if (isAdmin && petDocsPet.clienteId) {
        await refreshAdminPetVaccineInfo(petDocsPet);
        setEditingAdminPetVaccines(false);
      } else {
        setPetDocsPet(null);
        onPetRegistered?.();
      }
    } catch (error) {
      showToast(error?.message || "Não foi possível salvar vacinas.", "error");
    } finally {
      setSavingPetVaccines(false);
    }
  }

  function setSupportUploading(key, uploadingValue) {
    setUploadingSupportKeys((current) => ({
      ...current,
      [key]: Boolean(uploadingValue),
    }));
  }

  function isSupportUploading(key) {
    return Boolean(uploadingSupportKeys[key]);
  }

  async function handleUploadSupportDoc(key) {
    const file = selectedSupportFiles[key];
    if (!file || isSupportUploading(key)) return;

    const tipoId = documentTypeIds[key];
    if (!tipoId) {
      showToast(
        "Tipo de documento nao configurado. Verifique Documentos_Tipo.",
        "error",
      );
      return;
    }

    setSupportUploading(key, true);
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
        error?.message || "Não foi possível enviar o documento.",
        "error",
      );
    } finally {
      setSupportUploading(key, false);
    }
  }

  function handleSupportPrimaryAction(key) {
    const fieldMeta = SUPPORT_DOC_FIELDS.find((d) => d.key === key);
    const isRequired = Boolean(fieldMeta?.required);
    const isConcluded = isSupportDocumentSubmitted(key);

    if (isRequired && isConcluded) {
      return;
    }

    if (selectedSupportFiles[key]) {
      handleUploadSupportDoc(key);
      return;
    }
    openSupportFilePicker(key);
  }

  function getPetVaccineStatus(pet) {
    const sideStatuses = ["frente", "verso"].map((side) =>
      getPetCarteiraSideStatus(pet, side),
    );
    if (sideStatuses.some((item) => item.tone === "rejected")) {
      return { label: "Reprovado", tone: "rejected" };
    }
    if (sideStatuses.every((item) => item.tone === "done")) {
      return { label: "Pet Aprovado", tone: "approved" };
    }
    if (getSubmittedPetCarteiras(pet).length) {
      return { label: "Pendente", tone: "pending" };
    }

    return { label: "Enviar Carteira", tone: "missing" };
  }

  function renderPetVaccineAction(pet) {
    const status = getPetVaccineStatus(pet);
    const canOpen = ["approved", "missing", "pending", "rejected"].includes(
      status.tone,
    );

    return (
      <button
        type="button"
        className="melpet-vaccine-card-btn"
        disabled={!canOpen}
        onClick={() => {
          if (canOpen) openVaccineCardInfo(pet);
        }}
      >
        <span>Carteira de Vacinação</span>
        <strong
          className={`melpet-vaccine-card-status melpet-vaccine-card-status--${status.tone}`}
        >
          {status.label}
        </strong>
      </button>
    );
  }

  function renderPetDeleteAction(pet) {
    return (
      <Button
        type="button"
        variant="danger"
        className="melpet-pet-delete-btn"
        onClick={() => openDeletePetModal(pet)}
        disabled={deletingPetId === pet.id}
      >
        {deletingPetId === pet.id ? "Excluindo..." : "Excluir"}
      </Button>
    );
  }

  function renderVaccineCardInfoContainer() {
    return (
      <section className="melpet-vaccine-card-container pet-registration-form">
        <div className="melpet-vaccine-card-container-header">
          <h3>Carteira de Vacinação</h3>
        </div>

        <div className="pet-form-body">
          {loadingVaccineCardInfo ? (
            <p>Carregando carteira de vacinação...</p>
          ) : vaccineCardInfoError ? (
            <p className="melpet-error">{vaccineCardInfoError}</p>
          ) : vaccineCardItems.length ? (
            <div className="melpet-vaccine-card-list">
              {vaccineCardItems.map((item) => {
                const nextDate = addMonthsToDate(
                  item.dataAplicacao,
                  item.duracao,
                );
                return (
                  <fieldset
                    className="pet-form-section"
                    key={`${item.configId}-${item.tipo}`}
                  >
                    <legend>{item.descricao || "Vacina / outro"}</legend>
                    <div className="pet-form-grid melpet-vaccine-readonly-grid">
                      <div className="pet-form-field melpet-vaccine-readonly-field melpet-vaccine-readonly-wide">
                        <span className="pet-form-label">Tipo</span>
                        <strong>{item.tipo || "-"}</strong>
                      </div>
                      <div className="pet-form-field melpet-vaccine-readonly-field">
                        <span className="pet-form-label">
                          Data de aplicação
                        </span>
                        <strong>{formatBrazilDate(item.dataAplicacao)}</strong>
                      </div>
                      <div className="pet-form-field melpet-vaccine-readonly-field">
                        <span className="pet-form-label">
                          Próxima aplicação
                        </span>
                        <strong>
                          {nextDate ? formatBrazilDate(nextDate) : "-"}
                        </strong>
                      </div>
                    </div>
                  </fieldset>
                );
              })}
            </div>
          ) : (
            <p>Nenhuma informação de vacinação cadastrada para este pet.</p>
          )}
        </div>
      </section>
    );
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
              leadingAction: renderPetVaccineAction(pet),
              trailingAction: renderPetDeleteAction(pet),
              title: pet.nome,
              summary: getPetSummary(pet),
              isOpen:
                (petFormMode === "view" ||
                  petFormMode === "vaccine" ||
                  petFormMode === "vaccineUpload") &&
                selectedPet?.id === pet.id,
              onAction: () => handleOpenPetDetails(pet),
              content:
                petFormMode === "vaccine" && selectedPet?.id === pet.id ? (
                  renderVaccineCardInfoContainer()
                ) : petFormMode === "vaccineUpload" &&
                  selectedPet?.id === pet.id ? (
                  renderPetDocumentsContent()
                ) : (
                  <PetRegistrationForm
                    initialData={getPetFormInitialData(pet)}
                    readOnly
                  />
                ),
            }))),
      ],
      after: deveBloquearVoltarNoFluxoPet ? null : (
        <div className="pet-main-actions melpet-back-actions">
          <Button
            type="button"
            variant="outline"
            onClick={handleBackFromPetAdminMenu}
            className="melpet-back-button"
          >
            Voltar
          </Button>
        </div>
      ),
    },
  ];

  function formatAnamnesisValue(value) {
    if (Array.isArray(value)) return value.filter(Boolean).join(", ");
    if (value === true) return "Sim";
    if (value === false) return "Não";
    return String(value || "").trim();
  }

  function getFilledAnamnesisGroups(pet) {
    const ficha = pet?.ficha || {};
    return PET_ANAMNESIS_SECTIONS.map((section) => ({
      title: section.title,
      items: section.fields
        .filter(
          (field) =>
            ![
              "nomePet",
              "raca",
              "pesoAproximado",
              "veterinarioNome",
              "clinicaNome",
              "clinicaTelefone",
              "clinicaEndereco",
            ].includes(field.name),
        )
        .map((field) => ({
          label: field.label,
          value: formatAnamnesisValue(ficha[field.name]),
        }))
        .filter((item) => item.value),
    })).filter((section) => section.items.length);
  }

  function getPetCarteiraBySide(side) {
    return (
      getCurrentPetCarteiras(petDocsPet).find(
        (carteira) => carteira.lado === side && carteiraHasStoredFile(carteira),
      ) || null
    );
  }

  function hasCompletePetCarteira(pet = petDocsPet) {
    return ["frente", "verso"].every((side) =>
      getCurrentPetCarteiras(pet).some(
        (carteira) => carteira.lado === side && carteiraHasStoredFile(carteira),
      ),
    );
  }

  async function startAdminPetVaccineEdit() {
    if (!petDocsPet?.id) return;
    await loadPetVaccineConfigs();
    setEditingAdminPetVaccines(true);
  }

  async function cancelAdminPetVaccineEdit() {
    setEditingAdminPetVaccines(false);
    await refreshAdminPetVaccineInfo(petDocsPet);
  }

  function openPetCarteiraDocument(side) {
    const carteira = getPetCarteiraBySide(side);
    const id = Number(carteira?.id);
    if (!Number.isInteger(id) || id <= 0) {
      showToast("Carteirinha nao encontrada para visualizacao.", "error");
      return;
    }
    setDocumentPreviewTitle(
      `Carteirinha de vacinação - ${side === "verso" ? "Verso" : "Frente"}`,
    );
    setDocumentPreviewSrc(
      `/melpethostel/pets/carteiras-vacinacao/${id}/preview`,
    );
    setDocumentPreviewOpen(true);
  }

  function renderAdminPetVaccineContent() {
    const hasVaccineInfo = vaccineCardItems.length > 0;
    const hasCarteiraFiles = hasCompletePetCarteira(petDocsPet);
    const canEditVaccineInfo = isAdmin && hasVaccineInfo && hasCarteiraFiles;
    return (
      <div className="melpet-admin-pet-vaccine-content">
        <div
          className="melpet-admin-carteira-actions"
          aria-label="Visualizar carteirinha"
        >
          {[
            ["frente", "Frente"],
            ["verso", "Verso"],
          ].map(([side, label]) => {
            const carteira = getPetCarteiraBySide(side);
            return (
              <Button
                key={side}
                type="button"
                variant="outline"
                disabled={!carteiraHasStoredFile(carteira)}
                onClick={() => openPetCarteiraDocument(side)}
              >
                {label}
              </Button>
            );
          })}
        </div>
        {canEditVaccineInfo ? (
          <div className="melpet-admin-pet-vaccine-edit-actions">
            {editingAdminPetVaccines ? (
              <Button
                type="button"
                variant="outline"
                disabled={savingPetVaccines}
                onClick={cancelAdminPetVaccineEdit}
              >
                Cancelar edição
              </Button>
            ) : (
              <Button type="button" onClick={startAdminPetVaccineEdit}>
                Editar informações
              </Button>
            )}
          </div>
        ) : null}
        {hasVaccineInfo && hasCarteiraFiles && !editingAdminPetVaccines ? (
          renderVaccineCardInfoContainer()
        ) : (
          <>
            {hasVaccineInfo && !editingAdminPetVaccines
              ? renderVaccineCardInfoContainer()
              : null}
            {renderPetDocumentsContent()}
          </>
        )}
      </div>
    );
  }
  function renderPetDocumentsContent() {
    if (!petDocsPet) return null;
    const vaccineStatus = getPetVaccineStatus(petDocsPet);
    const isAdminPetFicha = Boolean(isAdmin && petDocsPet?.clienteId);
    const isReadOnlyVaccineUpload = Boolean(
      petVaccineResponsesSaved && !editingAdminPetVaccines,
    );
    const documentStatuses = [
      ["frente", "Carteirinha de vacinação frente"],
      ["verso", "Carteirinha de vacinação verso"],
    ].map(([side, label]) => ({
      side,
      documentLabel: label,
      statusLabel: getPetCarteiraSideStatus(petDocsPet, side).label,
      tone: getPetCarteiraSideStatus(petDocsPet, side).tone,
      motivo: getPetCarteiraSideStatus(petDocsPet, side).motivo,
    }));
    const rejectedDocumentStatuses = documentStatuses.filter(
      (item) => item.tone === "rejected",
    );

    return (
      <section className="melpet-pet-documents">
        {!isAdminPetFicha || rejectedDocumentStatuses.length ? (
          <div className="pet-registration-required-message">
            {rejectedDocumentStatuses.length ? (
              <div className="melpet-vaccine-rejection-notice">
                <strong>Detalhes da reprovação</strong>
                {rejectedDocumentStatuses.map((item) => (
                  <dl key={item.side}>
                    <div>
                      <dt>Documento:</dt>
                      <dd>{item.documentLabel}</dd>
                    </div>
                    <div>
                      <dt>Status:</dt>
                      <dd>{item.statusLabel}</dd>
                    </div>
                    {item.tone === "rejected" ? (
                      <div>
                        <dt>Motivo:</dt>
                        <dd>{item.motivo || "Motivo não informado."}</dd>
                      </div>
                    ) : null}
                  </dl>
                ))}
              </div>
            ) : (
              <p>
                Agora é o momento de você nos enviar os documentos{" "}
                {getPetGenderText(petDocsPet)} {petDocsPet.nome}!
              </p>
            )}
          </div>
        ) : null}

        {petDocsPet.tutorNome && !isAdminPetFicha ? (
          <dl className="melpet-pet-tutor-card">
            <div>
              <dt>Tutor</dt>
              <dd>{petDocsPet.tutorNome}</dd>
            </div>
            <div>
              <dt>CPF</dt>
              <dd>
                {petDocsPet.tutorCpf ? maskCpf(petDocsPet.tutorCpf) : "-"}
              </dd>
            </div>
            <div>
              <dt>RG</dt>
              <dd>{petDocsPet.tutorRg || "-"}</dd>
            </div>
          </dl>
        ) : null}

        <ul className="melpet-upload-doc-list">
          {[
            ["frente", "Carteirinha de vacinação Frente"],
            ["verso", "Carteirinha de vacinação Verso"],
          ].map(([side, label]) => {
            const selectedPetFile = petVaccineFiles[side];
            const isUploadingThis = uploadingPetVaccineSide === side;
            const sideStatus = getPetCarteiraSideStatus(petDocsPet, side);
            const isConcluded = Boolean(uploadedPetVaccineSides[side]);
            const canReplaceCarteira =
              isAdminPetFicha && editingAdminPetVaccines;
            const actionDisabled =
              isUploadingThis ||
              (isConcluded && !canReplaceCarteira) ||
              isReadOnlyVaccineUpload;

            return (
              <li
                className={`melpet-upload-doc-item ${
                  sideStatus.tone === "rejected"
                    ? "is-rejected"
                    : isConcluded
                      ? "is-done"
                      : "is-pending"
                }`}
                key={side}
              >
                <div className="melpet-upload-doc-main">
                  <div className="melpet-upload-doc-copy">
                    <strong>{label}</strong>
                    <span
                      className={`melpet-doc-status melpet-doc-status--${sideStatus.tone}`}
                    >
                      {sideStatus.label}
                    </span>
                  </div>
                  <Button
                    type="button"
                    onClick={() => handlePetVaccinePrimaryAction(side)}
                    disabled={actionDisabled}
                  >
                    {isUploadingThis
                      ? "Enviando..."
                      : selectedPetFile
                        ? isConcluded && canReplaceCarteira
                          ? "Substituir"
                          : "Enviar"
                        : isConcluded && canReplaceCarteira
                          ? "Substituir"
                          : "Upload"}
                  </Button>
                </div>

                <input
                  ref={(el) => {
                    petVaccineFileRefs.current[side] = el;
                  }}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="melpet-file-input-hidden"
                  onChange={(event) => handlePetVaccineFile(side, event)}
                />

                {selectedPetFile ? (
                  <div className="melpet-selected-file-block">
                    <p className="melpet-selected-file-name">
                      <span className="melpet-selected-file-value">
                        {selectedPetFile.name}
                        <button
                          type="button"
                          className="melpet-clear-file-btn"
                          onClick={() => clearPetVaccineFile(side)}
                          aria-label="Excluir seleção de arquivo"
                          title="Excluir seleção"
                          disabled={actionDisabled}
                        >
                          X
                        </button>
                      </span>
                    </p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="melpet-pet-vaccine-fields">
          {petVaccineConfigs.map((config) => {
            const tipos = normalizeVaccineTypes(config.tipos, config.duracao);
            const response = petVaccineResponses[config.id] || {};
            const selectedValue = getSingleVaccineResponseValue(response.valor);
            const required =
              config.obrigatorio ||
              String(config.descricao || "")
                .toLowerCase()
                .includes("escudo protetor");

            return (
              <fieldset className="pet-form-section" key={config.id}>
                <legend>
                  {config.descricao}
                  {required ? " *" : ""}
                </legend>
                {(tipos.length ? tipos : [{ descricao: config.descricao }]).map(
                  (tipo) => {
                    const normalizedType = normalizeVaccineType(tipo);
                    const value = normalizedType.descricao || config.descricao;
                    return (
                      <label className="pet-confirmation" key={value}>
                        <input
                          type="checkbox"
                          checked={selectedValue === value}
                          disabled={isReadOnlyVaccineUpload}
                          onChange={(event) =>
                            updatePetVaccineResponse(
                              config.id,
                              "valor",
                              event.target.checked ? value : "",
                            )
                          }
                        />
                        <span>{getVaccineTypeLabel(normalizedType)}</span>
                      </label>
                    );
                  },
                )}
                <label className="pet-form-field">
                  Data da aplicação
                  <input
                    type="date"
                    value={response.dataAplicacao || ""}
                    disabled={isReadOnlyVaccineUpload}
                    onChange={(event) =>
                      updatePetVaccineResponse(
                        config.id,
                        "dataAplicacao",
                        event.target.value,
                      )
                    }
                  />
                </label>
              </fieldset>
            );
          })}
        </div>

        {petVaccineConfigs.length ? (
          <Button
            type="button"
            disabled={savingPetVaccines || petVaccineResponsesSaved}
            onClick={savePetVaccineResponses}
          >
            {savingPetVaccines
              ? "Salvando..."
              : petVaccineResponsesSaved
                ? "Vacinas e outros salvos"
                : "Salvar vacinas e outros"}
          </Button>
        ) : null}
      </section>
    );
  }

  const userPetRegistrationPanels = petRegistrationPanels;

  const hostingTipos = Array.from(
    new Set(planos.map((plano) => plano.tipo).filter(Boolean)),
  );
  const hostingSelectedPets = registeredPets.filter((pet) =>
    hostingPetIds.includes(pet.id),
  );
  const hostingItems = hostingSelectedPets.map((pet) => {
    const period = hostingPetPeriods[pet.id] || {};
    const tipo = period.tipo || "";
    const monthlyPlans = tipo ? getMonthlyPlans(pet, tipo) : [];
    const selectedMonthlyPlan = tipo
      ? getPetPlanValue(pet, tipo, period.planoId)
      : null;
    const uniquePlan = tipo ? getDefaultUniquePlan(pet, tipo) : null;
    const plano =
      selectedMonthlyPlan &&
      getPlanBillingMode(selectedMonthlyPlan) === "mensal"
        ? selectedMonthlyPlan
        : monthlyPlans.length
          ? null
          : uniquePlan;
    const billingMode = plano ? getPlanBillingMode(plano) : "unico";
    const recurring = plano ? isRecurringPlan(plano) : false;
    const dayUse = plano ? isDayUsePlan(plano) : false;
    const quantity = Number(plano?.tempoQuantidade || 1);
    const dailyValue = plano ? getPlanDailyValue(plano) : 0;
    const inicioMes = recurring ? period.inicioMes || "" : "";
    const entrada = recurring
      ? getStartMonthDate(inicioMes)
      : dayUse
        ? period.dataUso || ""
        : period.entrada || "";
    const saida = recurring
      ? ""
      : dayUse
        ? period.dataUso || ""
        : period.saida || "";
    const days = recurring
      ? 1
      : getHostingDaysBetween(entrada, saida, plano?.tipoCalculo);
    const recurringValue = plano ? Number(plano.valor || 0) : 0;
    return {
      pet,
      tipo,
      plano,
      billingMode,
      recurring,
      dayUse,
      quantity,
      inicioMes,
      entrada,
      saida,
      days,
      dailyValue,
      total: recurring ? recurringValue : dailyValue * days,
    };
  });
  const hostingTotal = hostingItems.reduce((sum, item) => sum + item.total, 0);
  const hostingHistoryStats = useMemo(() => {
    const total = hostingRequests.length;
    const pending = hostingRequests.filter(
      (request) => getHostingRequestStatusTone(request.status) === "pending",
    ).length;
    const approved = hostingRequests.filter(
      (request) => getHostingRequestStatusTone(request.status) === "approved",
    ).length;
    const latestRequest = hostingRequests[0] || null;

    return { total, pending, approved, latestRequest };
  }, [hostingRequests]);

  const hostingStatusFilters = [
    { key: "all", label: "Todos" },
    { key: "pendente", label: "Pendente" },
    { key: "aprovado", label: "Aprovado" },
    { key: "confirmado", label: "Confirmado" },
    { key: "concluido", label: "Concluído" },
    { key: "recusado", label: "Recusado" },
    { key: "cancelado", label: "Cancelado" },
  ];

  const hostingRequestsOrdered = useMemo(
    () =>
      [...hostingRequests].sort((left, right) => {
        const leftTime = new Date(left.criadoEm || 0).getTime();
        const rightTime = new Date(right.criadoEm || 0).getTime();
        return rightTime - leftTime;
      }),
    [hostingRequests],
  );

  const hostingRequestsVisible = useMemo(() => {
    const filteredByStatus =
      hostingHistoryStatusFilter === "all"
        ? hostingRequestsOrdered
        : hostingRequestsOrdered.filter(
            (request) =>
              getHostingRequestStatusKey(request.status) ===
              hostingHistoryStatusFilter,
          );

    return filteredByStatus;
  }, [hostingHistoryStatusFilter, hostingRequestsOrdered]);

  async function cancelHostingRequest(requestId) {
    setCancelingHostingRequestId(requestId);
    try {
      const data = await api.patch(
        `/melpethostel/hospedagens/solicitacoes/${requestId}/cancelar`,
      );
      if (data?.solicitacao?.id) {
        setHostingRequests((current) =>
          current.map((request) =>
            Number(request.id) === Number(requestId)
              ? {
                  ...request,
                  status: data.solicitacao.status,
                  pagamentos: (request.pagamentos || []).map((payment) => {
                    const targetCompetence = data.solicitacao.competencia;
                    const shouldUpdateMonthly =
                      data.solicitacao.mensalidadeStatus &&
                      (!targetCompetence ||
                        getPaymentCompetence(payment) === targetCompetence);
                    return shouldUpdateMonthly
                      ? {
                          ...payment,
                          mensalidadeStatus: data.solicitacao.mensalidadeStatus,
                        }
                      : payment;
                  }),
                }
              : request,
          ),
        );
        setHostingRequestOpenId(Number(requestId));
      } else {
        await loadHostingRequests();
      }
      showToast(data?.mensagem || "Solicitacao cancelada.", "success");
    } catch (error) {
      showToast(
        error?.message || "Não foi possível cancelar o pedido.",
        "error",
      );
    } finally {
      setCancelingHostingRequestId(null);
    }
  }

  const hostingRequestContent = (
    <div className="melpet-hosting-stack">
      <section className="melpet-hosting-request">
        <div className="melpet-hosting-guidance">
          Hotel e Pet Day usam período por diária. Creche, Lar Temporário e
          Residência usam pagamento recorrente, com quantidade e mês de início.
        </div>

        <section className="melpet-hosting-pets">
          <h3>Selecione o Pet que deseja hospedar</h3>
          <div className="melpet-hosting-pet-list">
            {registeredPets.length ? (
              registeredPets.map((pet) => {
                const status = getPetVaccineStatus(pet);
                const approved = status.tone === "approved";
                const selected = hostingPetIds.includes(pet.id);
                const period = hostingPetPeriods[pet.id] || {};
                const monthlyPlans = period.tipo
                  ? getMonthlyPlans(pet, period.tipo)
                  : [];
                const uniquePlan = period.tipo
                  ? getDefaultUniquePlan(pet, period.tipo)
                  : null;
                const plano = period.tipo
                  ? getPetPlanValue(pet, period.tipo, period.planoId) ||
                    (monthlyPlans.length ? null : uniquePlan)
                  : null;
                const recurring = plano ? isRecurringPlan(plano) : false;
                const dayUse = plano ? isDayUsePlan(plano) : false;
                const shouldShowPeriodFields =
                  Boolean(period.tipo) &&
                  (!monthlyPlans.length || Boolean(period.planoId));
                return (
                  <div
                    className={`melpet-hosting-pet-card ${
                      selected ? "is-selected" : ""
                    }`}
                    key={pet.id}
                  >
                    <button
                      type="button"
                      className="melpet-hosting-pet-select"
                      disabled={!approved}
                      onClick={() => toggleHostingPet(pet.id)}
                    >
                      <span>
                        <strong>{pet.nome}</strong>
                        <small>{getPetSummary(pet)}</small>
                      </span>
                      <em
                        className={
                          approved
                            ? "melpet-hosting-status is-approved"
                            : "melpet-hosting-status is-blocked"
                        }
                      >
                        {approved
                          ? "Pet Aprovado"
                          : "Pet Pendente: Verifique Documentação"}
                        {approved && selected && period.tipo ? (
                          <span
                            className={
                              plano
                                ? "melpet-hosting-status-price"
                                : "melpet-hosting-status-price is-missing"
                            }
                          >
                            {plano
                              ? `${formatCurrency(plano.valor)} / ${formatPlanTempo(plano)}`
                              : "Selecione um plano"}
                          </span>
                        ) : null}
                      </em>
                    </button>

                    {selected ? (
                      <div className="melpet-hosting-pet-period">
                        <label>
                          Tipo de hospedagem
                          <select
                            value={period.tipo || ""}
                            onChange={(event) =>
                              updateHostingPetPeriod(
                                pet.id,
                                "tipo",
                                event.target.value,
                              )
                            }
                          >
                            <option value="">Selecione</option>
                            {hostingTipos.map((tipo) => (
                              <option key={tipo} value={tipo}>
                                {tipo}
                              </option>
                            ))}
                          </select>
                        </label>
                        {period.tipo && monthlyPlans.length ? (
                          <label>
                            Plano
                            <select
                              value={period.planoId || ""}
                              onChange={(event) =>
                                updateHostingPetPeriod(
                                  pet.id,
                                  "planoId",
                                  event.target.value,
                                )
                              }
                            >
                              <option value="">Selecione</option>
                              {monthlyPlans.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {formatPlanTempo(item)}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        {shouldShowPeriodFields && recurring ? (
                          <>
                            <label>
                              Iniciando em
                              <input
                                type="month"
                                value={period.inicioMes || ""}
                                onChange={(event) =>
                                  updateHostingPetPeriod(
                                    pet.id,
                                    "inicioMes",
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                          </>
                        ) : null}
                        {shouldShowPeriodFields && dayUse ? (
                          <label>
                            Data de utilização
                            <input
                              type="date"
                              value={period.dataUso || ""}
                              onChange={(event) =>
                                updateHostingPetPeriod(
                                  pet.id,
                                  "dataUso",
                                  event.target.value,
                                )
                              }
                            />
                          </label>
                        ) : null}
                        {shouldShowPeriodFields && !recurring && !dayUse ? (
                          <>
                            <label>
                              Entrada
                              <input
                                type="date"
                                value={period.entrada || ""}
                                onChange={(event) =>
                                  updateHostingPetPeriod(
                                    pet.id,
                                    "entrada",
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                            <label>
                              Saída
                              <input
                                type="date"
                                value={period.saida || ""}
                                onChange={(event) =>
                                  updateHostingPetPeriod(
                                    pet.id,
                                    "saida",
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <p>Nenhum pet cadastrado.</p>
            )}
          </div>
        </section>

        <div className="melpet-hosting-actions melpet-hosting-actions--top">
          <Button
            className="melpet-clear-button"
            type="button"
            variant="secondary"
            disabled={sendingHostingRequest}
            onClick={clearHostingRequest}
          >
            Limpar
          </Button>
        </div>
      </section>

      <section className="melpet-hosting-summary">
        <h3>Resumo</h3>
        {hostingItems.length ? (
          <>
            <ul>
              {hostingItems.map((item) => (
                <li className="melpet-hosting-summary-item" key={item.pet.id}>
                  <div className="melpet-hosting-summary-item-main">
                    <strong>{item.pet.nome}</strong>
                    {item.plano ? (
                      <div className="melpet-hosting-summary-item-details">
                        <span className="melpet-hosting-summary-chip">
                          {item.tipo}
                        </span>
                        <span className="melpet-hosting-summary-chip">
                          {formatPlanTempo(item.plano)}
                        </span>
                        <span className="melpet-hosting-summary-chip is-price">
                          {formatCurrency(item.dailyValue)} / dia
                        </span>
                        <small>
                          {item.recurring
                            ? "Início " +
                              formatStartMonth(item.inicioMes) +
                              " · " +
                              item.quantity +
                              " " +
                              (item.plano.tempoUnidade || "dia") +
                              " · mensal"
                            : item.dayUse
                              ? formatBrazilDate(item.entrada) + " · 1 dia"
                              : formatBrazilDate(item.entrada) +
                                " a " +
                                formatBrazilDate(item.saida) +
                                " · " +
                                (item.days || 0) +
                                " dias"}
                        </small>
                      </div>
                    ) : (
                      <small>Sem valor configurado para este pet</small>
                    )}
                  </div>
                  <strong className="melpet-hosting-summary-item-total">
                    {formatCurrency(item.total)}
                  </strong>
                </li>
              ))}
            </ul>
            <div className="melpet-hosting-total">
              <span>Total final</span>
              <strong>{formatCurrency(hostingTotal)}</strong>
            </div>
            <div className="melpet-hosting-actions">
              <Button
                type="button"
                disabled={sendingHostingRequest}
                onClick={sendHostingRequest}
              >
                {sendingHostingRequest ? "Enviando..." : "Enviar solicitação"}
              </Button>
            </div>
          </>
        ) : (
          <p>Selecione pelo menos um pet aprovado para calcular o pedido.</p>
        )}
      </section>
    </div>
  );

  function renderHostingPaymentPanel(request) {
    const requestTotal = request.valorFinal ?? request.valorTotal;
    const payments = hasMonthlyCancellationRequested(request)
      ? getHostingPayments(request).filter(
          (payment) =>
            String(payment?.status || "").toLowerCase() === "confirmado",
        )
      : getVisibleHostingPayments(request);
    const canManagePayment = shouldShowHostingPaymentPanel(request, payments);
    if (!canManagePayment && !payments.length) {
      return null;
    }
    const paymentMessage = getHostingPaymentMessage(request);
    if (!payments.length) {
      return (
        <div className="melpet-hosting-payment-card">
          <div>
            <span className="melpet-hosting-history-kicker">Pagamento PIX</span>
            <h4>{formatCurrency(requestTotal)}</h4>
          </div>
          <p>Escolha como deseja realizar o pagamento.</p>
          <div className="melpet-hosting-payment-options">
            <Button
              type="button"
              className="melpet-hosting-payment-option is-total"
              disabled={generatingHostingPaymentId === request.id}
              onClick={() => generateHostingPaymentOption(request, "total")}
            >
              <strong>Pagamento total</strong>
              <span>Gerar um PIX único</span>
            </Button>
            {!isMonthlyHostingRequest(request) ? (
              <Button
                type="button"
                variant="outline"
                className="melpet-hosting-payment-option is-reserve"
                disabled={generatingHostingPaymentId === request.id}
                onClick={() =>
                  generateHostingPaymentOption(
                    request,

                    "dividido",
                  )
                }
              >
                <strong>Reserva + Check-in</strong>

                <span>Dividir em duas etapas com PIX</span>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="melpet-hosting-payment-option is-card"
              disabled={generatingHostingPaymentId === request.id}
              onClick={() =>
                generateHostingPaymentOption(request, "cartao_credito")
              }
            >
              <strong>Cartão de Crédito</strong>
              <span>Enviaremos um Link de Pagamento</span>
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="melpet-hosting-payment-card">
        {paymentMessage ? (
          <div className="melpet-hosting-history-highlight">
            {paymentMessage}
          </div>
        ) : null}
        {canChangeHostingPaymentOption(request) ? (
          <div className="melpet-hosting-payment-change">
            <span className="melpet-hosting-history-kicker">
              Mudar tipo de pagamento
            </span>
            <div className="melpet-hosting-payment-options is-compact">
              <Button
                type="button"
                className="melpet-hosting-payment-option is-total"
                disabled={generatingHostingPaymentId === request.id}
                onClick={() => generateHostingPaymentOption(request, "total")}
              >
                <strong>Pagamento total</strong>
                <span>Gerar um PIX único</span>
              </Button>
              {!isMonthlyHostingRequest(request) ? (
                <Button
                  type="button"
                  variant="outline"
                  className="melpet-hosting-payment-option is-reserve"
                  disabled={generatingHostingPaymentId === request.id}
                  onClick={() =>
                    generateHostingPaymentOption(
                      request,

                      "dividido",
                    )
                  }
                >
                  <strong>Reserva + Check-in</strong>

                  <span>Dividir em duas etapas com PIX</span>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="melpet-hosting-payment-option is-card"
                disabled={generatingHostingPaymentId === request.id}
                onClick={() =>
                  generateHostingPaymentOption(request, "cartao_credito")
                }
              >
                <strong>Cartão de Crédito</strong>
                <span>Enviaremos um Link de Pagamento</span>
              </Button>
            </div>
          </div>
        ) : null}
        {payments.map((payment) => {
          const paymentKey = request.id + "-" + payment.parcelaTipo;
          const paymentStatus = String(payment.status || "").toLowerCase();
          const isConfirmed = paymentStatus === "confirmado";
          const isRejected = paymentStatus === "reprovado";
          const hasPendingReceipt = paymentStatus === "comprovante_enviado";
          const uploadTarget = {
            ...request,
            parcelaTipo: payment.parcelaTipo,
          };
          return (
            <div
              className={`melpet-hosting-payment-installment ${isRejected ? "is-rejected" : isConfirmed ? "is-done" : hasPendingReceipt ? "is-pending" : ""}`}
              key={payment.id || paymentKey}
            >
              <div>
                <span className="melpet-hosting-history-kicker">
                  {getHostingPaymentLabel(payment)}
                </span>
                <h4>{formatCurrency(payment.valor)}</h4>
                <span
                  className={`melpet-doc-status melpet-doc-status--${
                    isRejected
                      ? "rejected"
                      : isConfirmed
                        ? "approved"
                        : hasPendingReceipt
                          ? "pending"
                          : "pending"
                  }`}
                >
                  {isRejected
                    ? "Reprovado"
                    : isConfirmed
                      ? "Aprovado"
                      : hasPendingReceipt
                        ? "Enviado para conferencia"
                        : "Pendente"}
                </span>
              </div>
              {isConfirmed ? (
                <div className="melpet-hosting-history-note is-success">
                  <strong>{formatHostingCheckInOut(request)}</strong>
                  <p>
                    {payment.conferidoEm
                      ? `Confirmado em ${formatDateTime(payment.conferidoEm)}`
                      : "Comprovante aprovado pelo administrador."}
                  </p>
                  {getMonthlyPaymentCycleText(request, payment) ? (
                    <p className="melpet-hosting-payment-cycle">
                      {getMonthlyPaymentCycleText(request, payment)}
                    </p>
                  ) : null}
                  {payment.comprovanteUrl ? (
                    <div className="melpet-hosting-payment-confirmed-actions">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openHostingPaymentPreview(payment)}
                      >
                        Visualizar comprovante
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : payment.parcelaTipo === "cartao_credito" ? (
                <div className="melpet-hosting-card-payment-info">
                  <p>
                    Iremos gerar um link de pagamento para a opção de cartão de
                    crédito. Assim que o link for gerado, ficará disponivel
                    abaixo e você também receberá por email. Depois do
                    pagamento, envie o comprovante neste pedido.
                  </p>
                  {payment.linkPagamento ? (
                    <a
                      href={payment.linkPagamento}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {payment.linkPagamento}
                    </a>
                  ) : (
                    <span>
                      Aguarde a geração do link de pagamento. Avisaremos quando
                      estiver disponível.
                    </span>
                  )}
                </div>
              ) : payment.pixCopiaCola ? (
                <div className="melpet-hosting-payment-grid">
                  {payment.qrCodeUrl ? (
                    <img
                      className="melpet-hosting-payment-qr"
                      src={payment.qrCodeUrl}
                      alt="QR Code PIX"
                    />
                  ) : null}
                  <label className="pet-form-field melpet-hosting-pix-copy-field">
                    <span>PIX copia e cola</span>
                    <textarea readOnly value={payment.pixCopiaCola} rows={4} />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copyHostingPixCode(payment.pixCopiaCola)}
                    >
                      Copiar
                    </Button>
                  </label>
                </div>
              ) : (
                <p className="melpet-error">
                  PIX ainda não configurado para este pedido.
                </p>
              )}
              {isRejected ? (
                <div className="melpet-vaccine-rejection-notice melpet-document-rejection-notice">
                  <strong>Detalhes da reprovacao</strong>
                  <div className="melpet-document-rejection-reason">
                    <span>Motivo:</span>
                    <p>{payment.motivoRecusa || "Motivo nao informado."}</p>
                  </div>
                </div>
              ) : null}
              {!isConfirmed && !isRejected && payment.comprovanteUrl ? (
                <div className="melpet-hosting-history-note">
                  <strong>Comprovante enviado</strong>
                  <p>
                    {payment.comprovanteNome ||
                      "Aguardando aprovação do administrador."}
                  </p>
                </div>
              ) : null}
              {!isConfirmed &&
              !hasPendingReceipt &&
              (payment.parcelaTipo !== "cartao_credito" ||
                Boolean(payment.linkPagamento)) ? (
                <div className="melpet-hosting-receipt-upload">
                  <input
                    ref={(el) => {
                      hostingPaymentFileRefs.current[paymentKey] = el;
                    }}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
                    className="melpet-file-input-hidden"
                    onChange={(event) =>
                      handleHostingPaymentFile(paymentKey, event)
                    }
                  />
                  <div className="melpet-hosting-receipt-upload-copy">
                    <strong>Comprovante de pagamento</strong>
                    <span>Envie PDF, JPG ou PNG para análise.</span>
                  </div>
                  <div className="melpet-hosting-receipt-upload-actions">
                    <Button
                      type="button"
                      variant="outline"
                      className="melpet-hosting-receipt-select"
                      onClick={() =>
                        hostingPaymentFileRefs.current[paymentKey]?.click()
                      }
                    >
                      <strong>Selecionar comprovante</strong>
                      <span>
                        {hostingPaymentFiles[paymentKey]?.name ||
                          "Nenhum arquivo selecionado"}
                      </span>
                    </Button>
                    <Button
                      type="button"
                      className="melpet-hosting-receipt-send"
                      disabled={uploadingHostingPaymentId === request.id}
                      onClick={() => uploadHostingPaymentReceipt(uploadTarget)}
                    >
                      {uploadingHostingPaymentId === request.id
                        ? "Enviando..."
                        : "Enviar comprovante"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  const hostingRequestsContent = (
    <section className="melpet-hosting-history">
      <header className="melpet-hosting-history-hero">
        <div>
          <span className="melpet-hosting-history-kicker">
            Acompanhamento do seu pet hotel
          </span>
          <h3>Meus Pedidos de Hospedagem</h3>
          <p>
            Consulte suas solicitações, acompanhe o status e revise os itens de
            cada pedido em um só lugar.
          </p>
        </div>

        <div className="melpet-hosting-history-stats">
          <div>
            <strong>{hostingHistoryStats.total}</strong>
            <span>Total</span>
          </div>
          <div>
            <strong>{hostingHistoryStats.pending}</strong>
            <span>Pendentes</span>
          </div>
          <div>
            <strong>{hostingHistoryStats.approved}</strong>
            <span>Aprovados</span>
          </div>
        </div>
      </header>

      <div className="melpet-hosting-history-toolbar">
        <p>Veja aqui os pedidos enviados e o andamento de cada solicitação.</p>
      </div>

      <div className="melpet-hosting-history-filters-card">
        <div className="melpet-hosting-history-filters-card-header">
          <div>
            <strong>Filtrar por status</strong>
            <p>Use o mesmo bloco visual dos pedidos para manter o padrão.</p>
          </div>
          <span className="melpet-hosting-history-card-badge">
            {hostingRequestsVisible.length} visível(is)
          </span>
        </div>

        <label className="melpet-hosting-history-select-field">
          <span>Status</span>
          <select
            value={hostingHistoryStatusFilter}
            onChange={(event) => {
              setHostingHistoryStatusFilter(event.target.value);
              setHostingRequestOpenId(null);
            }}
          >
            {hostingStatusFilters.map((filter) => (
              <option key={filter.key} value={filter.key}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {hostingRequestsError ? (
        <p className="melpet-error">{hostingRequestsError}</p>
      ) : null}

      {loadingHostingRequests ? (
        <p>Carregando pedidos...</p>
      ) : hostingRequestsVisible.length ? (
        <div className="melpet-hosting-history-list">
          {hostingRequestsVisible.map((request) => {
            const isOpen = hostingRequestOpenId === request.id;
            const requestTotal = request.valorFinal ?? request.valorTotal;
            const isMonthlyCancellationRequested =
              hasMonthlyCancellationRequested(request);
            const requestStatusTone = isMonthlyCancellationRequested
              ? "canceled"
              : getHostingRequestStatusTone(request.status);
            const showPaymentPendingStatus =
              !isMonthlyCancellationRequested &&
              (requestStatusTone === "approved" ||
                hasPendingHostingPayment(request));
            const isUsedHosting =
              getHostingRequestStatusKey(request.status) === "concluido";
            return (
              <article
                key={request.id}
                className={`melpet-hosting-history-card ${isOpen ? "is-open" : ""}`}
              >
                <button
                  type="button"
                  className="melpet-hosting-history-card-toggle"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setHostingRequestOpenId((current) =>
                      current === request.id ? null : request.id,
                    )
                  }
                >
                  <div className="melpet-hosting-history-card-main">
                    <div className="melpet-hosting-history-card-topline">
                      <strong>Pedido #{request.id}</strong>
                      <span className="melpet-hosting-history-card-badge">
                        {request.itens?.length || 0} item(s)
                      </span>
                      {hostingHistoryStats.latestRequest?.id === request.id ? (
                        <span className="melpet-hosting-history-highlight">
                          Pedido mais recente
                        </span>
                      ) : null}
                    </div>
                    <div className="melpet-hosting-history-card-date">
                      <span>Data do pedido</span>
                      <strong>{formatDateTime(request.criadoEm)}</strong>
                    </div>
                  </div>
                  <span
                    className={`melpet-hosting-history-status is-${requestStatusTone} ${showPaymentPendingStatus ? "has-payment-pending" : ""}`}
                  >
                    <strong>
                      {isMonthlyCancellationRequested
                        ? "Cancelado"
                        : getHostingRequestStatusLabel(request.status)}
                    </strong>
                    <span
                      className={
                        showPaymentPendingStatus
                          ? "melpet-hosting-payment-pending-label"
                          : undefined
                      }
                    >
                      {isMonthlyCancellationRequested
                        ? `Válido até ${getMonthlyValidityText(request)}`
                        : requestStatusTone === "confirmed"
                          ? formatHostingCheckInOut(request)
                          : showPaymentPendingStatus
                            ? "Pagamento Pendente"
                            : getHostingRequestStatusDetail(request.status)}
                    </span>
                  </span>
                  <span
                    className="melpet-hosting-history-toggle-icon"
                    aria-hidden="true"
                  >
                    {isOpen ? "−" : "+"}
                  </span>
                </button>

                {isOpen ? (
                  <>
                    <dl className="melpet-hosting-history-meta">
                      <div>
                        <dt>Serviço</dt>
                        <dd>{request.tipo || "-"}</dd>
                      </div>
                      <div>
                        <dt>Período</dt>
                        <dd>{formatHostingRequestPeriod(request)}</dd>
                      </div>
                      <div>
                        <dt>Total geral</dt>
                        <dd>{formatCurrency(requestTotal)}</dd>
                      </div>
                      <div>
                        <dt>Atualizado em</dt>
                        <dd>{formatDateTime(request.atualizadoEm)}</dd>
                      </div>
                    </dl>

                    <div
                      className={`melpet-hosting-history-items ${isUsedHosting ? "is-used-hosting" : ""}`}
                    >
                      <h4>Itens</h4>
                      <ul>
                        {(request.itens || []).map((item) => {
                          const itemTotal = Number(item.valorTotal || 0);
                          const adjustmentValue = Number(
                            request.descontoValor || 0,
                          );
                          const requestOriginalTotal = Number(
                            request.valorTotal || 0,
                          );
                          const itemAdjustment =
                            requestOriginalTotal > 0
                              ? Number(
                                  (
                                    (Math.abs(adjustmentValue) * itemTotal) /
                                    requestOriginalTotal
                                  ).toFixed(2),
                                )
                              : 0;
                          const itemFinalTotal =
                            adjustmentValue > 0
                              ? itemTotal - itemAdjustment
                              : itemTotal + itemAdjustment;
                          return (
                            <li key={item.id}>
                              <strong>
                                {item.petNome || `Pet ${item.petId}`}
                              </strong>
                              <small>
                                {isUsedHosting
                                  ? "Hospedagem Utilizada"
                                  : `${item.tipo} / ${item.tempoQuantidade} ${item.tempoUnidade} -> ${formatCurrency(item.valorDiaria)}`}
                              </small>
                              <small>{formatHostingItemPeriod(item)}</small>
                              <strong>{formatCurrency(itemTotal)}</strong>
                              {adjustmentValue !== 0 ? (
                                <div className="melpet-hosting-history-item-adjustment">
                                  <span>
                                    {adjustmentValue > 0
                                      ? "Desconto"
                                      : "Acréscimo"}
                                  </span>
                                  <strong>
                                    {formatCurrency(itemAdjustment)}
                                  </strong>
                                  <span>Total</span>
                                  <strong>
                                    {formatCurrency(itemFinalTotal)}
                                  </strong>
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    {getMonthlyCancellationNotice(request) ? (
                      <div className="melpet-hosting-history-note is-cancel-request">
                        <strong>{getMonthlyCancellationNotice(request)}</strong>
                      </div>
                    ) : null}
                    {request.motivoRecusa ? (
                      <div className="melpet-hosting-history-note">
                        <strong>Motivo da recusa</strong>
                        <p>{request.motivoRecusa}</p>
                      </div>
                    ) : null}
                    {!isUsedHosting &&
                    shouldShowHostingPaymentPanel(
                      request,
                      getVisibleHostingPayments(request),
                    ) ? (
                      <div className="melpet-hosting-payment-redirect">
                        <strong>Pagamento disponível</strong>
                        <p>
                          Acesse o Extrato de Pagamentos para efetuar o
                          pagamento e confirmar o pedido.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            onNavigateUserMenu?.("extratoPagamentos")
                          }
                        >
                          Acessar Extrato de Pagamentos
                        </Button>
                      </div>
                    ) : null}
                    {canCancelHostingRequest(request.status, request) ? (
                      <div className="melpet-hosting-history-actions">
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          disabled={cancelingHostingRequestId === request.id}
                          onClick={() => cancelHostingRequest(request.id)}
                        >
                          {cancelingHostingRequestId === request.id
                            ? "Cancelando..."
                            : isMonthlyHostingRequest(request)
                              ? "Solicitar cancelamento"
                              : "Cancelar pedido"}
                        </Button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="melpet-hosting-history-card-summary">
                    {request.tipo || "Hospedagem"} ·{" "}
                    {formatHostingRequestPeriod(request)} ·{" "}
                    {formatCurrency(requestTotal)}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p>Nenhum pedido de hospedagem encontrado.</p>
      )}
    </section>
  );

  const paymentStatementRequests = hostingRequests.filter((request) => {
    const isUsedHosting =
      getHostingRequestStatusKey(request.status) === "concluido";
    if (isUsedHosting) return false;
    const payments = getVisibleHostingPayments(request);
    return (
      payments.length > 0 || shouldShowHostingPaymentPanel(request, payments)
    );
  });
  const openPaymentStatementCount = paymentStatementRequests.filter((request) =>
    shouldShowHostingPaymentPanel(request, getVisibleHostingPayments(request)),
  ).length;

  const paymentStatementContent = (
    <section className="melpet-hosting-history melpet-payment-statement">
      <header className="melpet-hosting-history-hero">
        <div>
          <span className="melpet-hosting-history-kicker">Financeiro</span>
          <h3>Extrato de Pagamentos</h3>
          <p>
            Consulte cobranças, realize pagamentos e acompanhe cada comprovante
            em um único lugar.
          </p>
        </div>
        <div className="melpet-hosting-history-stats">
          <div>
            <strong>{openPaymentStatementCount}</strong>
            <span>Em aberto</span>
          </div>
        </div>
      </header>
      {loadingHostingRequests ? (
        <p className="melpet-validate-message">Carregando extrato...</p>
      ) : paymentStatementRequests.length ? (
        <div className="melpet-hosting-history-list">
          {paymentStatementRequests.map((request) => (
            <article
              key={request.id}
              className="melpet-hosting-history-card is-open"
            >
              <div className="melpet-hosting-history-card-main">
                <div className="melpet-hosting-history-card-topline">
                  <strong>Pedido #{request.id}</strong>
                  <span className="melpet-hosting-history-card-badge">
                    {request.itens?.length || 0} item(s)
                  </span>
                </div>
                <div className="melpet-hosting-history-card-date">
                  <span>Data do pedido</span>
                  <strong>{formatDateTime(request.criadoEm)}</strong>
                </div>
              </div>
              <div className="melpet-hosting-history-items">
                <h4>Itens</h4>
                <ul>
                  {(request.itens || []).map((item) => {
                    const itemTotal = Number(item.valorTotal || 0);
                    const adjustmentValue = Number(request.descontoValor || 0);
                    const requestOriginalTotal = Number(
                      request.valorTotal || 0,
                    );
                    const itemAdjustment =
                      requestOriginalTotal > 0
                        ? Number(
                            (
                              (Math.abs(adjustmentValue) * itemTotal) /
                              requestOriginalTotal
                            ).toFixed(2),
                          )
                        : 0;
                    const itemFinalTotal =
                      adjustmentValue > 0
                        ? itemTotal - itemAdjustment
                        : itemTotal + itemAdjustment;
                    return (
                      <li key={item.id}>
                        <strong>{item.petNome || `Pet ${item.petId}`}</strong>
                        <small>
                          {isMonthlyHostingRequest(request)
                            ? formatMonthlyHostingItem(item)
                            : `${item.tipo} · ${formatHostingItemPeriod(item)}`}
                        </small>
                        <strong>{formatCurrency(itemTotal)}</strong>
                        {adjustmentValue !== 0 ? (
                          <div className="melpet-hosting-history-item-adjustment">
                            <span>
                              {adjustmentValue > 0 ? "Desconto" : "Acréscimo"}
                            </span>
                            <strong>{formatCurrency(itemAdjustment)}</strong>
                            <span>Total</span>
                            <strong>{formatCurrency(itemFinalTotal)}</strong>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
              {renderHostingPaymentPanel(request)}
            </article>
          ))}
        </div>
      ) : (
        <p className="melpet-validate-message">
          Nenhuma cobrança disponível no momento.
        </p>
      )}
      <div className="pet-main-actions melpet-back-actions">
        <Button
          type="button"
          variant="outline"
          onClick={() => handleMelPetBack("main")}
          className="melpet-back-button"
        >
          Voltar
        </Button>
      </div>
    </section>
  );
  const adminPixConfigContent = (
    <section className="melpet-section-content melpet-admin-pix-config">
      <form
        className="admin-user-create-section melpet-admin-pix-config-card"
        onSubmit={savePixConfig}
      >
        <div className="melpet-admin-pix-config-band">
          <div className="pet-form-grid melpet-admin-pix-config-grid">
            <label className="pet-form-field">
              Chave PIX
              <input
                type="text"
                value={pixConfigForm.chavePix}
                onChange={(event) =>
                  setPixConfigForm((current) => ({
                    ...current,
                    chavePix: event.target.value,
                  }))
                }
                placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatoria"
              />
            </label>
            <label className="pet-form-field">
              Nome do recebedor
              <input
                type="text"
                value={pixConfigForm.nomeRecebedor}
                onChange={(event) =>
                  setPixConfigForm((current) => ({
                    ...current,
                    nomeRecebedor: event.target.value,
                  }))
                }
              />
            </label>
            <label className="pet-form-field">
              Cidade
              <input
                type="text"
                value={pixConfigForm.cidadeRecebedor}
                onChange={(event) =>
                  setPixConfigForm((current) => ({
                    ...current,
                    cidadeRecebedor: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          {pixConfigError ? (
            <p className="melpet-error">{pixConfigError}</p>
          ) : null}
          {loadingPixConfig ? (
            <p className="melpet-validate-message">
              Carregando configuracao...
            </p>
          ) : null}

          <div className="melpet-hosting-history-actions melpet-admin-pix-actions">
            <Button type="submit" disabled={savingPixConfig}>
              {savingPixConfig ? "Salvando..." : "Salvar PIX"}
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
  const adminHostingPaymentReviewContent = (
    <section className="melpet-section-content melpet-admin-hosting-payments melpet-admin-hosting-payment-review">
      <div className="admin-user-create-section melpet-admin-hosting-payment-review-card">
        <div className="melpet-admin-hosting-payment-review-band">
          {loadingHostingPaymentReceipts ? (
            <p className="melpet-validate-message">
              Carregando comprovantes pendentes...
            </p>
          ) : pendingHostingPaymentRequests.length ? (
            <div className="melpet-hosting-history-list">
              {pendingHostingPaymentRequests.map((request) => {
                const pendingPayments = (request.pagamentos || []).filter(
                  (payment) => payment.status === "comprovante_enviado",
                );
                const requestTotal = request.valorFinal ?? request.valorTotal;
                const pets = request.itens?.length
                  ? request.itens
                  : [{ id: "sem-pet", petNome: "Pet nao informado" }];

                return (
                  <article
                    className="melpet-hosting-history-card is-open"
                    key={"payment-" + request.id}
                  >
                    <div className="melpet-hosting-history-card-header">
                      <div>
                        <strong>
                          {request.clienteNome ||
                            request.usuarioLogin ||
                            "Tutor"}
                        </strong>
                        <small>
                          Pedido #{request.id} - {formatCurrency(requestTotal)}
                        </small>
                      </div>
                      <span className="melpet-hosting-history-card-badge">
                        {pendingPayments.length} pendente(s)
                      </span>
                    </div>

                    <div className="melpet-hosting-history-items">
                      <ul>
                        {pets.map((item) => (
                          <li key={item.id || item.petId || item.petNome}>
                            <strong>
                              {item.petNome || `Pet ${item.petId}`}
                            </strong>
                            <small>Comprovantes pendentes</small>
                            <div className="melpet-hosting-payment-subgroup">
                              {pendingPayments.map((payment) => (
                                <div
                                  className="melpet-hosting-payment-subitem"
                                  key={payment.id}
                                >
                                  <strong>
                                    {getHostingPaymentLabel(payment)}
                                  </strong>
                                  <small>{formatCurrency(payment.valor)}</small>
                                  <small>
                                    {payment.enviadoEm
                                      ? formatDateTime(payment.enviadoEm)
                                      : "Aguardando conferencia"}
                                  </small>
                                  <div className="melpet-hosting-history-actions">
                                    {payment.comprovanteUrl ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          openHostingPaymentPreview(payment)
                                        }
                                      >
                                        Visualizar
                                      </Button>
                                    ) : null}
                                    <Button
                                      type="button"
                                      size="sm"
                                      disabled={
                                        approvingHostingPaymentId === payment.id
                                      }
                                      onClick={() =>
                                        approveHostingPaymentReceipt(payment)
                                      }
                                    >
                                      {approvingHostingPaymentId === payment.id
                                        ? "Aprovando..."
                                        : "Aprovar comprovante"}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="danger"
                                      size="sm"
                                      disabled={
                                        approvingHostingPaymentId === payment.id
                                      }
                                      onClick={() =>
                                        openRejectHostingPaymentModal(
                                          payment,
                                          request,
                                        )
                                      }
                                    >
                                      Recusar
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="melpet-validate-message">
              Nenhum comprovante pendente no momento.
            </p>
          )}
        </div>
      </div>
    </section>
  );
  const adminCardPaymentLinkContent = (
    <section className="melpet-section-content melpet-admin-hosting-payments melpet-admin-card-payment-link-review">
      <div className="admin-user-create-section melpet-admin-card-payment-link-card">
        <div className="melpet-admin-card-payment-link-band">
          {loadingCardPaymentRequests ? (
            <p className="melpet-validate-message">
              Carregando links pendentes...
            </p>
          ) : pendingCardPaymentRequests.length ? (
            <div className="melpet-hosting-history-list">
              {pendingCardPaymentRequests.map((request) => {
                const pendingLinks = (request.pagamentos || []).filter(
                  (payment) =>
                    payment.parcelaTipo === "cartao_credito" &&
                    !payment.linkPagamento,
                );
                const requestTotal = request.valorFinal ?? request.valorTotal;
                const pets = request.itens?.length
                  ? request.itens
                  : [{ id: "sem-pet", petNome: "Pet nao informado" }];

                return (
                  <article
                    className="melpet-hosting-history-card is-open"
                    key={"card-link-" + request.id}
                  >
                    <div className="melpet-hosting-history-card-header">
                      <div>
                        <strong>
                          {request.clienteNome ||
                            request.usuarioLogin ||
                            "Tutor"}
                        </strong>
                        <small>
                          Pedido #{request.id} - {formatCurrency(requestTotal)}
                        </small>
                      </div>
                      <span className="melpet-hosting-history-card-badge">
                        Cartao de credito
                      </span>
                    </div>

                    <div className="melpet-hosting-history-items">
                      <ul>
                        {pets.map((item) => (
                          <li key={item.id || item.petId || item.petNome}>
                            <strong>
                              {item.petNome || `Pet ${item.petId}`}
                            </strong>
                            <small>Link de pagamento pendente</small>
                            <div className="melpet-hosting-payment-subgroup">
                              {pendingLinks.map((payment) => (
                                <div
                                  className="melpet-hosting-payment-subitem"
                                  key={payment.id}
                                >
                                  <strong>
                                    {getHostingPaymentLabel(payment)}
                                  </strong>
                                  <small>{formatCurrency(payment.valor)}</small>
                                  <label className="pet-form-field melpet-card-link-field">
                                    <span>Link de pagamento</span>
                                    <input
                                      type="url"
                                      placeholder="https://..."
                                      value={cardPaymentLinks[payment.id] || ""}
                                      onChange={(event) =>
                                        setCardPaymentLinks((current) => ({
                                          ...current,
                                          [payment.id]: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>
                                  <div className="melpet-hosting-history-actions">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={async () => {
                                        const text =
                                          await navigator.clipboard?.readText?.();
                                        if (text) {
                                          setCardPaymentLinks((current) => ({
                                            ...current,
                                            [payment.id]: text,
                                          }));
                                        }
                                      }}
                                    >
                                      Colar link de pagamento
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      disabled={
                                        sendingCardPaymentLinkId === payment.id
                                      }
                                      onClick={() =>
                                        sendCardPaymentLink(payment, request)
                                      }
                                    >
                                      {sendingCardPaymentLinkId === payment.id
                                        ? "Enviando..."
                                        : "Enviar link"}
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="melpet-validate-message">
              Nenhum pagamento por cartao pendente no momento.
            </p>
          )}
        </div>
      </div>
    </section>
  );
  const adminHostingCheckinContent = (
    <section className="melpet-section-content melpet-admin-hosting-checkin">
      <div className="admin-user-create-section melpet-admin-hosting-checkin-card">
        <div className="melpet-admin-hosting-checkin-band">
          {loadingHostingCheckinRequests ? (
            <p className="melpet-validate-message">
              Carregando hospedagens confirmadas...
            </p>
          ) : pendingHostingCheckinRequests.length ? (
            <div className="melpet-hosting-history-list">
              {pendingHostingCheckinRequests.map((request) => {
                const requestTotal = request.valorFinal ?? request.valorTotal;
                const pets = request.itens?.length
                  ? request.itens
                  : [{ id: "sem-pet", petNome: "Pet nao informado" }];
                return (
                  <article
                    className="melpet-hosting-history-card is-open"
                    key={"checkin-" + request.id}
                  >
                    <div className="melpet-hosting-history-card-header">
                      <div>
                        <strong>
                          {request.clienteNome ||
                            request.usuarioLogin ||
                            "Tutor"}
                        </strong>
                        <small>
                          Pedido #{request.id} - {formatCurrency(requestTotal)}
                        </small>
                      </div>
                      <span className="melpet-hosting-history-status is-confirmed">
                        <strong>Confirmado</strong>
                        <span>{formatHostingCheckInOut(request)}</span>
                      </span>
                    </div>
                    <div className="melpet-hosting-history-items">
                      <ul>
                        {pets.map((item) => (
                          <li key={item.id || item.petId || item.petNome}>
                            <strong>
                              {item.petNome || `Pet ${item.petId}`}
                            </strong>
                            <small>{request.tipo || "Hospedagem"}</small>
                            <small>{formatHostingItemPeriod(item)}</small>
                            <strong>
                              {formatCurrency(item.valorTotal || requestTotal)}
                            </strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <dl className="melpet-hosting-history-meta">
                      <div>
                        <dt>Servico</dt>
                        <dd>{request.tipo || "-"}</dd>
                      </div>
                      <div>
                        <dt>Periodo</dt>
                        <dd>{formatHostingRequestPeriod(request)}</dd>
                      </div>
                      <div>
                        <dt>Total</dt>
                        <dd>{formatCurrency(requestTotal)}</dd>
                      </div>
                    </dl>
                    <div className="melpet-hosting-history-actions">
                      <Button
                        type="button"
                        disabled={confirmingHostingCheckinId === request.id}
                        onClick={() => confirmHostingCheckin(request)}
                      >
                        {confirmingHostingCheckinId === request.id
                          ? "Confirmando..."
                          : "Fazer Check-in"}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="melpet-validate-message">
              Nenhuma hospedagem confirmada aguardando check-in.
            </p>
          )}
        </div>
      </div>
    </section>
  );
  const adminHostingApprovalContent = (
    <section className="melpet-section-content melpet-admin-hosting-approval">
      <div className="admin-user-create-section melpet-admin-hosting-approval-card">
        <div className="melpet-admin-hosting-approval-band">
          {pendingHostingRequestsError ? (
            <p className="melpet-error">{pendingHostingRequestsError}</p>
          ) : null}

          {loadingPendingHostingRequests ? (
            <p className="melpet-validate-message">
              Carregando hospedagens pendentes...
            </p>
          ) : pendingHostingRequests.length ? (
            <div className="melpet-hosting-history-list">
              {pendingHostingRequests.map((request) => {
                const isOpen = selectedPendingHostingId === request.id;
                const requestTotal = request.valorFinal ?? request.valorTotal;
                const busy = reviewingHostingRequestId === request.id;
                const adjustment = getHostingApprovalAdjustment(request);
                return (
                  <article
                    className={`melpet-hosting-history-card ${isOpen ? "is-open" : ""}`}
                    key={request.id}
                  >
                    <button
                      type="button"
                      className="melpet-hosting-history-card-toggle"
                      aria-expanded={isOpen}
                      onClick={() =>
                        setSelectedPendingHostingId((current) =>
                          current === request.id ? null : request.id,
                        )
                      }
                    >
                      <div className="melpet-hosting-history-card-main">
                        <div className="melpet-hosting-history-card-topline">
                          <strong>
                            {request.clienteNome ||
                              request.usuarioLogin ||
                              "Tutor"}
                          </strong>
                          <span className="melpet-hosting-history-card-badge">
                            Pedido #{request.id}
                          </span>
                        </div>
                        <div className="melpet-hosting-history-card-date">
                          <span>Data do pedido</span>
                          <strong>{formatDateTime(request.criadoEm)}</strong>
                        </div>
                      </div>
                      <span className="melpet-hosting-history-status is-pending">
                        <strong>Pendente</strong>
                        <span>{request.itens?.length || 0} item(s)</span>
                      </span>
                      <span
                        className="melpet-hosting-history-toggle-icon"
                        aria-hidden="true"
                      >
                        {isOpen ? "−" : "+"}
                      </span>
                    </button>

                    {isOpen ? (
                      <>
                        <dl className="melpet-hosting-history-meta">
                          <div>
                            <dt>Tutor</dt>
                            <dd>
                              {request.clienteNome ||
                                request.usuarioLogin ||
                                "-"}
                            </dd>
                          </div>
                          <div>
                            <dt>Serviço</dt>
                            <dd>{request.tipo || "-"}</dd>
                          </div>
                          <div>
                            <dt>Período</dt>
                            <dd>{formatHostingRequestPeriod(request)}</dd>
                          </div>
                          <div>
                            <dt>Total solicitado</dt>
                            <dd>{formatCurrency(requestTotal)}</dd>
                          </div>
                        </dl>
                        <div className="melpet-hosting-history-items">
                          <h4>Itens</h4>
                          <ul>
                            {(request.itens || []).map((item) => (
                              <li key={item.id}>
                                <strong>
                                  {item.petNome || `Pet ${item.petId}`}
                                </strong>
                                <small>
                                  {item.tipo} / {item.tempoQuantidade}{" "}
                                  {item.tempoUnidade} {"->"}{" "}
                                  {formatCurrency(item.valorDiaria)}
                                </small>
                                <small>{formatHostingItemPeriod(item)}</small>
                                <strong>
                                  {formatCurrency(item.valorTotal)}
                                </strong>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="melpet-hosting-adjustment">
                          <div className="melpet-hosting-adjustment-heading">
                            <strong>Ajuste financeiro</strong>
                            <span>Opcional, aplicado antes da aprovação</span>
                          </div>
                          <div className="pet-form-grid">
                            <label className="pet-form-field">
                              <span>Operação</span>
                              <select
                                value={adjustment.type}
                                disabled={busy}
                                onChange={(event) =>
                                  setHostingApprovalAdjustments((current) => ({
                                    ...current,
                                    [request.id]: {
                                      ...(current[request.id] || {}),
                                      type: event.target.value,
                                    },
                                  }))
                                }
                              >
                                <option value="desconto">Desconto</option>
                                <option value="acrescimo">Acréscimo</option>
                              </select>
                            </label>
                            <label className="pet-form-field">
                              <span>Formato</span>
                              <select
                                value={adjustment.mode}
                                disabled={busy}
                                onChange={(event) =>
                                  setHostingApprovalAdjustments((current) => ({
                                    ...current,
                                    [request.id]: {
                                      ...(current[request.id] || {}),
                                      mode: event.target.value,
                                    },
                                  }))
                                }
                              >
                                <option value="valor">Valor em reais</option>
                                <option value="percentual">Percentual</option>
                              </select>
                            </label>
                            <label className="pet-form-field">
                              <span>
                                {adjustment.mode === "percentual"
                                  ? "Percentual"
                                  : "Valor do ajuste"}
                              </span>
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder={
                                  adjustment.mode === "percentual"
                                    ? "Ex.: 5"
                                    : "Ex.: 50,00"
                                }
                                value={
                                  hostingApprovalAdjustments[request.id]
                                    ?.value || ""
                                }
                                disabled={busy}
                                onChange={(event) =>
                                  setHostingApprovalAdjustments((current) => ({
                                    ...current,
                                    [request.id]: {
                                      ...(current[request.id] || {}),
                                      value: event.target.value,
                                    },
                                  }))
                                }
                              />
                            </label>
                            <label className="pet-form-field pet-form-field--wide">
                              <span>Motivo do ajuste</span>
                              <input
                                type="text"
                                maxLength={500}
                                placeholder="Obrigatório quando houver desconto ou acréscimo"
                                value={
                                  hostingApprovalAdjustments[request.id]
                                    ?.reason || ""
                                }
                                disabled={busy}
                                onChange={(event) =>
                                  setHostingApprovalAdjustments((current) => ({
                                    ...current,
                                    [request.id]: {
                                      ...(current[request.id] || {}),
                                      reason: event.target.value,
                                    },
                                  }))
                                }
                              />
                            </label>
                          </div>
                          <dl className="melpet-hosting-history-meta melpet-hosting-adjustment-summary">
                            <div>
                              <dt>Valor solicitado</dt>
                              <dd>
                                {formatCurrency(
                                  Number(request.valorTotal || 0),
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>
                                {adjustment.type === "acrescimo"
                                  ? "Acréscimo"
                                  : "Desconto"}
                              </dt>
                              <dd>
                                {formatCurrency(adjustment.calculatedValue)}
                              </dd>
                            </div>
                            <div>
                              <dt>Total para pagamento</dt>
                              <dd>{formatCurrency(adjustment.finalValue)}</dd>
                            </div>
                          </dl>
                        </div>
                        <div className="melpet-hosting-history-actions">
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            onClick={() => approveHostingRequest(request)}
                          >
                            {busy ? "Processando..." : "Aprovar"}
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={busy}
                            onClick={() => openRejectHostingModal(request)}
                          >
                            Reprovar
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="melpet-hosting-history-card-summary">
                        {request.tipo || "Hospedagem"} ·{" "}
                        {formatHostingRequestPeriod(request)} ·{" "}
                        {formatCurrency(requestTotal)}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="melpet-validate-message">
              Nenhuma hospedagem pendente no momento.
            </p>
          )}
        </div>
      </div>
    </section>
  );

  const presenceWeekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  function renderPresenceCalendar({ editable = false } = {}) {
    const registeredPresences = [...(presenceSummary?.presencas || [])].sort(
      (first, second) =>
        String(first.dataPresenca).localeCompare(String(second.dataPresenca)),
    );
    const regularPresenceCount = Math.max(
      0,
      Number(presenceSummary?.diasContratados || 0),
    );
    const markedDates = new Set(
      registeredPresences.map((item) => item.dataPresenca),
    );
    const excessPresenceDates = new Set(
      registeredPresences
        .slice(regularPresenceCount)
        .map((item) => item.dataPresenca),
    );
    const days = buildPresenceCalendarDays(
      presenceSummary?.cicloInicio,
      presenceSummary?.cicloFim,
    );
    return (
      <div
        className="melpet-presence-calendar"
        aria-label="Calendário de presença"
      >
        <div className="melpet-presence-calendar-weekdays">
          {presenceWeekdays.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="melpet-presence-calendar-grid">
          {days.map((item) => {
            if (item.blank)
              return (
                <span key={item.key} className="melpet-presence-day is-empty" />
              );
            const isMarked = markedDates.has(item.date);
            const isExcess = excessPresenceDates.has(item.date);
            return (
              <button
                type="button"
                key={item.key}
                className={`melpet-presence-day ${isMarked ? "is-present" : ""} ${isExcess ? "is-excess" : ""}`}
                disabled={!editable || togglingPresenceDate === item.date}
                onClick={() => togglePresenceDate(item.date)}
                title={
                  isMarked
                    ? "Clique para retirar a presença"
                    : "Clique para registrar presença"
                }
              >
                <strong>{item.day}</strong>
                {isMarked ? (
                  <span className={`melpet-presence-day-label ${isExcess ? "is-excess" : "is-regular"}`}>
                    {isExcess ? "Excedente" : "Presente"}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div
          className="melpet-presence-legend"
          aria-label="Legenda do calendário"
        >
          <span className="is-regular">
            <i aria-hidden="true" />
            Presença dentro da franquia
          </span>
          <span className="is-excess">
            <i aria-hidden="true" />
            Presença excedente
          </span>
        </div>
      </div>
    );
  }

  function renderPresenceReport() {
    const rows = [...(presenceSummary?.presencas || [])].sort((first, second) =>
      String(first.dataPresenca).localeCompare(String(second.dataPresenca)),
    );
    const regularPresenceCount = Math.max(
      0,
      Number(presenceSummary?.diasContratados || 0),
    );
    const reportRows = rows;

    return (
      <div className="melpet-presence-report melpet-presence-report--admin-call-sheet">
        <header className="melpet-presence-call-sheet-header">
          <img src={melPetHostelLogo} alt="Mel Pet Hostel" />
          <div>
            <span>Mel Pet Hostel &amp; Cia</span>
            <strong>Chamada</strong>
          </div>
        </header>
        <table>
          <thead>
            <tr>
              <th>Dia</th>
              <th>Pet</th>
              <th>Data da presença</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {reportRows.length ? (
              reportRows.map((item, index) => (
                <tr key={item.id || item.dataPresenca || `dia-${index + 1}`}>
                  <td>{index + 1}</td>
                  <td>{presenceSummary?.petNome || "-"}</td>
                  <td>{formatBrazilDate(item.dataPresenca)}</td>
                  <td>
                    <span className="melpet-presence-call-entry">
                      Presente
                      {index >= regularPresenceCount ? <em>Excedente</em> : null}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4">Nenhum dia contratado para este ciclo.</td>
              </tr>
            )}
          </tbody>
        </table>
        <footer className="melpet-presence-call-sheet-footer">
          <span><img className="melpet-institutional-icon" src="https://api.iconify.design/material-symbols:phone-in-talk-rounded.svg?color=%23cfeafa" alt="" aria-hidden="true" />+55 11 96789-7374</span>
          <span><img className="melpet-institutional-icon" src="https://api.iconify.design/material-symbols:mail-rounded.svg?color=%23cfeafa" alt="" aria-hidden="true" />comercial@melpethostel.com.br</span>
          <span><img className="melpet-institutional-icon" src="https://api.iconify.design/material-symbols:location-on-rounded.svg?color=%23cfeafa" alt="" aria-hidden="true" />Rua Caviuna, 1 - São Roque - SP / CEP: 18143-453</span>
          <span><img className="melpet-institutional-icon" src="https://api.iconify.design/simple-icons:instagram.svg?color=%23cfeafa" alt="" aria-hidden="true" />@melpethostel</span>
        </footer>
      </div>
    );
  }
  function renderPresenceDetail({ editable = false } = {}) {
    return (
      <section className="melpet-section-content melpet-presence-page melpet-presence-single-card">
        <div
          className="melpet-presence-month-nav"
          aria-label="Navegar pelos meses"
        >
          <Button
            type="button"
            variant="outline"
            className="melpet-presence-month-arrow"
            onClick={() => shiftPresenceCompetence(-1)}
          >
            &lt;
          </Button>
          <div className="melpet-presence-month-current">
            <span>Ciclo contratado</span>
            <strong>
              {presenceSummary?.cicloInicio
                ? `${formatBrazilDate(presenceSummary.cicloInicio)} a ${formatBrazilDate(presenceSummary.cicloFim)}`
                : formatPresenceCompetence(presenceCompetence)}
            </strong>
          </div>
          <Button
            type="button"
            variant="outline"
            className="melpet-presence-month-arrow"
            onClick={() => shiftPresenceCompetence(1)}
          >
            &gt;
          </Button>
        </div>
        {loadingPresence ? (
          <p className="melpet-validate-message">Carregando presenças...</p>
        ) : null}
        {presenceSummary ? (
          <div className="melpet-presence-detail-body melpet-presence-print-area">
            {presenceViewMode === "report" ? (
              <div className="melpet-presence-admin-report-context">
                <span>Ciclo de presença</span>
                <strong>
                  {formatBrazilDate(presenceSummary.cicloInicio)} a{" "}
                  {formatBrazilDate(presenceSummary.cicloFim)}
                </strong>
              </div>
            ) : (
              <div className="melpet-presence-summary-band">
                <div>
                  <span>{presenceSummary.clienteNome}</span>
                  <strong>{presenceSummary.petNome}</strong>
                </div>
                <div>
                  <span>
                    {formatBrazilDate(presenceSummary.cicloInicio)} a{" "}
                    {formatBrazilDate(presenceSummary.cicloFim)}
                  </span>
                  <strong>
                    {presenceSummary.diasRestantes} dias restantes
                  </strong>
                </div>
              </div>
            )}
            {presenceViewMode === "calendar" ? (
              renderPresenceCalendar({ editable })
            ) : (
              <div className="melpet-presence-admin-report-frame">
                {renderPresenceReport()}
              </div>
            )}
            <div className="melpet-presence-balance">
              Restam <strong>{presenceSummary.diasRestantes}</strong> de{" "}
              <strong>{presenceSummary.diasContratados}</strong> dias para usar
              neste ciclo.
            </div>
            {Number(presenceSummary.diasExcedentes || 0) > 0 ? (
              <div className="melpet-presence-extra-billing">
                <strong>
                  {presenceSummary.diasExcedentes} dia(s) excedente(s)
                </strong>
                <span>
                  Valor excedente:{" "}
                  {formatCurrency(presenceSummary.valorExcedente || 0)}
                </span>
                <span>
                  Total com excedente:{" "}
                  {formatCurrency(presenceSummary.valorTotalComExcedente || 0)}
                </span>
                {Array.isArray(presenceSummary.faixasExcedentes) &&
                presenceSummary.faixasExcedentes.length ? (
                  <ul>
                    {presenceSummary.faixasExcedentes.map((faixa) => (
                      <li
                        key={`${faixa.planoQuantidade}-${faixa.diasUsados}-${faixa.valorFaixa}`}
                      >
                        {faixa.planoQuantidade}x na semana ({faixa.diasDoPlano}{" "}
                        dias no mês): {faixa.diasUsados} dia(s) x{" "}
                        {formatCurrency(faixa.valorDia)} ={" "}
                        {formatCurrency(faixa.valorFaixa)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : !loadingPresence ? (
          <p className="melpet-validate-message">
            Selecione um pet e um mês válido para visualizar o controle de
            presença.
          </p>
        ) : null}
        <div className="pet-main-actions melpet-back-actions melpet-presence-actions">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setPresenceViewMode((mode) =>
                mode === "calendar" ? "report" : "calendar",
              )
            }
          >
            {presenceViewMode === "calendar"
              ? "Modo Relatório"
              : "Modo Calendário"}
          </Button>
          <Button type="button" variant="outline" onClick={savePresencePdf}>
            Salvar em PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setActivePresencePetId(null);
              setPresenceSummary(null);
            }}
            className="melpet-back-button"
          >
            Voltar
          </Button>
        </div>
      </section>
    );
  }

  const userPresencePanels = [
    {
      id: "presence-control",
      title: "Controle de Presença",
      summary: "Acompanhe os dias utilizados no plano mensal.",
      ariaLabel: "Controle de Presença",
      items: presencePets.map((pet) => ({
        id: `presence-pet-${pet.petId}`,
        title: pet.petNome,
        summary: `${pet.clienteNome || "Tutor"} · ${formatPresenceCompetence(
          pet.ultimaCompetencia,
        )}`,
        onAction: () => openPresencePet(pet),
      })),
      children: loadingPresence ? (
        <p className="melpet-validate-message">Carregando pets...</p>
      ) : !presencePets.length ? (
        <p className="melpet-validate-message">
          Nenhum pet com mensalidade confirmada para controle de presença.
        </p>
      ) : null,
      after: (
        <div className="pet-main-actions melpet-back-actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleMelPetBack("main")}
            className="melpet-back-button"
          >
            Voltar
          </Button>
        </div>
      ),
    },
  ];
  const adminPresenceContent = activePresencePetId ? (
    renderPresenceDetail({ editable: true })
  ) : (
    <section className="melpet-section-content melpet-presence-page melpet-presence-single-card">
      <label className="pet-form-field melpet-presence-month-field">
        <span>Selecionar pet</span>
        <select
          value={activePresencePetId || ""}
          onChange={(event) => {
            const pet = presencePets.find(
              (item) => Number(item.petId) === Number(event.target.value),
            );
            if (pet) openPresencePet(pet);
          }}
        >
          <option value="">Selecione o pet</option>
          {presencePets.map((pet) => (
            <option key={pet.petId} value={pet.petId}>
              {pet.clienteNome} - {pet.petNome}
            </option>
          ))}
        </select>
      </label>
      {!loadingPresence && !presencePets.length ? (
        <p className="melpet-validate-message">
          Nenhum pet com mensalidade confirmada para registrar presença.
        </p>
      ) : null}
    </section>
  );
  const hostingPanels = [
    {
      id: "hosting",
      title: "Mel Pet Hostel",
      summary: "Acesse o sistema operacional do pet hotel.",
      ariaLabel: "Hospedagem",
      items: [
        {
          id: "solicitar-hospedagem",
          title: "Solicitar Hospedagem",
          isOpen: activeHostingMenu === "solicitarHospedagem",
          onAction: () =>
            setActiveHostingMenu((current) =>
              current === "solicitarHospedagem" ? "" : "solicitarHospedagem",
            ),
          content: hostingRequestContent,
        },
        {
          id: "meus-pedidos-hospedagem",
          title: "Meus Pedidos de Hospedagem",
          summary: "Acompanhe as solicitações enviadas.",
          isOpen: activeHostingMenu === "meusPedidosHospedagem",
          onAction: () =>
            setActiveHostingMenu((current) =>
              current === "meusPedidosHospedagem"
                ? ""
                : "meusPedidosHospedagem",
            ),
          content: hostingRequestsContent,
        },
      ],
      after: (
        <div className="pet-main-actions melpet-back-actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleMelPetBack("main")}
            className="melpet-back-button"
          >
            Voltar
          </Button>
        </div>
      ),
    },
  ];

  const vaccineManagementContent = (
    <section className="melpet-vaccine-admin-stack melpet-admin-vaccine-config-content">
      <form
        className="admin-user-create-section melpet-admin-vaccine-config-card"
        onSubmit={saveVaccineConfig}
      >
        <label>
          Descrição
          <input
            type="text"
            value={vaccineConfigForm.descricao}
            onChange={(event) =>
              setVaccineConfigForm((current) => ({
                ...current,
                descricao: event.target.value,
              }))
            }
            placeholder="Ex: Vacina Essencial"
          />
        </label>

        <label>
          Tipo
          <div className="melpet-vaccine-type-row melpet-vaccine-type-inputs">
            <input
              type="text"
              value={vaccineConfigForm.tipoAtual}
              onChange={(event) =>
                setVaccineConfigForm((current) => ({
                  ...current,
                  tipoAtual: event.target.value,
                }))
              }
              placeholder="Ex: V10"
            />
            <input
              type="text"
              value={vaccineConfigForm.tipoDuracaoAtual}
              onChange={(event) =>
                setVaccineConfigForm((current) => ({
                  ...current,
                  tipoDuracaoAtual: event.target.value,
                }))
              }
              placeholder="Duração em meses"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={addVaccineConfigType}
            >
              Adicionar
            </Button>
          </div>
        </label>

        {vaccineConfigForm.tipos.length ? (
          <ul className="melpet-vaccine-type-list">
            {vaccineConfigForm.tipos.map((tipo) => (
              <li key={normalizeVaccineType(tipo).descricao}>
                <span>{getVaccineTypeLabel(tipo)}</span>
                <button
                  type="button"
                  onClick={() => removeVaccineConfigType(tipo)}
                  aria-label={`Remover ${normalizeVaccineType(tipo).descricao}`}
                >
                  X
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {vaccineConfigError ? (
          <p className="admin-page-message erro">{vaccineConfigError}</p>
        ) : null}

        <label className="admin-page-checkbox admin-page-checkbox-field">
          <input
            type="checkbox"
            checked={vaccineConfigForm.obrigatorio}
            onChange={(event) =>
              setVaccineConfigForm((current) => ({
                ...current,
                obrigatorio: event.target.checked,
              }))
            }
          />
          Obrigatório
        </label>

        <div className="admin-page-actions">
          {editingVaccineConfigId ? (
            <Button
              type="button"
              variant="secondary"
              onClick={resetVaccineConfigForm}
            >
              Cancelar edição
            </Button>
          ) : null}
          <Button type="submit" disabled={savingVaccineConfig}>
            {savingVaccineConfig
              ? "Salvando..."
              : editingVaccineConfigId
                ? "Salvar alterações"
                : "Criar item"}
          </Button>
        </div>
      </form>

      <section className="admin-user-create-section melpet-admin-vaccine-config-list-card">
        {loadingVaccineConfig ? (
          <p>Carregando itens...</p>
        ) : vaccineConfigItems.length ? (
          <div className="admin-page-list">
            {vaccineConfigItems.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.descricao}</strong>
                  <span>{item.obrigatorio ? "Obrigatório" : "Opcional"}</span>
                  <ul className="melpet-vaccine-config-type-lines">
                    {normalizeVaccineTypes(item.tipos, item.duracao).map(
                      (tipo) => (
                        <li key={normalizeVaccineType(tipo).descricao}>
                          {getVaccineTypeLabel(tipo)}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
                <div className="admin-page-row-actions">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => startEditVaccineConfig(item)}
                    disabled={deletingVaccineConfigId === item.id}
                  >
                    Editar
                  </Button>
                  {confirmDeleteVaccineConfigId === item.id ? (
                    <>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => deleteVaccineConfig(item)}
                        disabled={deletingVaccineConfigId === item.id}
                      >
                        {deletingVaccineConfigId === item.id
                          ? "Excluindo..."
                          : "Confirmar"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={cancelDeleteVaccineConfig}
                        disabled={deletingVaccineConfigId === item.id}
                      >
                        Cancelar
                      </Button>
                    </>
                  ) : deleteWarningVaccineConfig?.id === item.id ? (
                    <>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => acknowledgeDeleteVaccineConfig(item)}
                      >
                        OK
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={cancelDeleteVaccineConfig}
                      >
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => startDeleteVaccineConfig(item)}
                      disabled={deletingVaccineConfigId === item.id}
                    >
                      Excluir
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>Nenhum item cadastrado.</p>
        )}
      </section>
    </section>
  );

  const planosByTipo = planos.reduce((acc, plano) => {
    const tipo = plano.tipo || "Sem tipo";
    acc[tipo] = [...(acc[tipo] || []), plano];
    return acc;
  }, {});

  const planosContent = (
    <section className="melpet-vaccine-admin-stack">
      <form className="admin-page-panel admin-page-form" onSubmit={savePlano}>
        <div className="admin-page-panel-title">
          <span>{editingPlanoId ? "Editando" : "Novo plano"}</span>
          <h3>Cadastro de Planos</h3>
        </div>

        <div className="melpet-plan-form-grid">
          <section className="melpet-plan-form-section">
            <span>Identificação</span>
            <label>
              Tipo
              <input
                type="text"
                value={planoForm.tipo}
                onChange={(event) =>
                  setPlanoForm((current) => ({
                    ...current,
                    tipo: event.target.value,
                  }))
                }
                placeholder="Ex: Hotel"
              />
            </label>
          </section>

          <section className="melpet-plan-form-section">
            <span>Faixa do pet</span>
            <div className="melpet-plan-form-row">
              <label>
                De
                <input
                  type="text"
                  value={planoForm.categoriaDe}
                  onChange={(event) =>
                    setPlanoForm((current) => ({
                      ...current,
                      categoriaDe: event.target.value,
                    }))
                  }
                  placeholder="Ex: 0 kg"
                />
              </label>

              <label>
                Até
                <input
                  type="text"
                  value={planoForm.categoriaAte}
                  onChange={(event) =>
                    setPlanoForm((current) => ({
                      ...current,
                      categoriaAte: event.target.value,
                    }))
                  }
                  placeholder="Ex: 10 kg"
                />
              </label>

              <label>
                Unidade
                <input
                  type="text"
                  value={planoForm.unidade}
                  onChange={(event) =>
                    setPlanoForm((current) => ({
                      ...current,
                      unidade: event.target.value,
                    }))
                  }
                  placeholder="Ex: Kg"
                />
              </label>
            </div>
          </section>

          <section className="melpet-plan-form-section">
            <span>Cobrança</span>
            <div className="melpet-plan-form-row">
              <label>
                Quantidade
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={planoForm.tempoQuantidade}
                  onChange={(event) =>
                    setPlanoForm((current) => ({
                      ...current,
                      tempoQuantidade: event.target.value.replace(/\D/g, ""),
                    }))
                  }
                  placeholder="Ex: 1"
                />
              </label>

              <label>
                Tempo
                <input
                  type="text"
                  value={planoForm.tempoUnidade}
                  onChange={(event) =>
                    setPlanoForm((current) => ({
                      ...current,
                      tempoUnidade: event.target.value,
                    }))
                  }
                  placeholder="Ex: dia, mês"
                />
              </label>

              <label>
                Tipo de cobrança
                <select
                  value={planoForm.tipoCobranca}
                  onChange={(event) =>
                    setPlanoForm((current) => ({
                      ...current,
                      tipoCobranca: event.target.value,
                    }))
                  }
                >
                  <option value="unico">Único</option>
                  <option value="mensal">Mensal</option>
                </select>
              </label>

              <label>
                Tipo de cálculo
                <select
                  value={planoForm.tipoCalculo}
                  onChange={(event) =>
                    setPlanoForm((current) => ({
                      ...current,
                      tipoCalculo: event.target.value,
                    }))
                  }
                >
                  <option value="pernoite">Pernoite</option>
                  <option value="dia_uso">Dia de uso</option>
                </select>
              </label>

              <label>
                Valor
                <input
                  type="text"
                  inputMode="decimal"
                  value={planoForm.valor}
                  onChange={(event) =>
                    setPlanoForm((current) => ({
                      ...current,
                      valor: maskCurrencyInput(event.target.value),
                    }))
                  }
                  placeholder="Ex: 20,00"
                />
              </label>
            </div>
          </section>
        </div>

        <div className="melpet-plan-form-actions">
          {editingPlanoId ? (
            <Button type="button" variant="secondary" onClick={cancelEditPlano}>
              Cancelar edição
            </Button>
          ) : null}
          <Button type="submit" disabled={savingPlano}>
            {savingPlano
              ? "Salvando..."
              : editingPlanoId
                ? "Salvar alterações"
                : "Adicionar categoria"}
          </Button>
        </div>

        {planosError ? (
          <p className="admin-page-message erro">{planosError}</p>
        ) : null}
      </form>

      <section className="admin-page-panel">
        <div className="admin-page-panel-title">
          <span>Itens cadastrados</span>
          <h3>Planos</h3>
        </div>

        {loadingPlanos ? (
          <p>Carregando planos...</p>
        ) : planos.length ? (
          <div className="melpet-plan-list">
            {Object.entries(planosByTipo).map(([tipo, itens]) => {
              const isOpen = Boolean(openPlanoTipos[tipo]);
              return (
                <article
                  className={`melpet-plan-group ${isOpen ? "is-open" : ""}`}
                  key={tipo}
                >
                  <button
                    type="button"
                    className="melpet-plan-type-toggle"
                    aria-expanded={isOpen}
                    onClick={() => togglePlanoTipo(tipo)}
                  >
                    <span>{tipo}</span>
                    <strong className="melpet-plan-type-meta">
                      <span>
                        {itens.length} {itens.length === 1 ? "item" : "itens"}
                      </span>
                    </strong>
                  </button>

                  {isOpen ? (
                    <ul>
                      {itens.map((plano) => (
                        <li key={plano.id}>
                          <div className="melpet-plan-item-main">
                            <span className="melpet-plan-range">
                              De {plano.categoriaDe} até {plano.categoriaAte}{" "}
                              {plano.unidade || "Kg"}
                            </span>
                            <strong>
                              {formatPlanTempo(plano)} -{" "}
                              {formatCurrency(plano.valor)} - Pagamento:{" "}
                              {plano.tipoCobranca === "mensal"
                                ? "Mensal"
                                : "Único"}{" "}
                              - Cálculo: {formatTipoCalculo(plano)}
                            </strong>
                          </div>
                          <div className="melpet-plan-item-actions">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => startEditPlano(plano)}
                            >
                              Editar
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <p>Nenhum plano cadastrado.</p>
        )}
      </section>
    </section>
  );

  const adminPetSearchContent = (
    <section className="melpet-admin-pet-maintenance-layout">
      <form
        className="admin-user-create-section admin-user-search-section melpet-admin-pet-search-card"
        onSubmit={loadPetStatusSearch}
      >
        <div className="admin-user-section-title">
          <span>Pesquisa</span>
          <h3>Pesquisar pet</h3>
        </div>
        <label className="admin-user-search-field">
          Buscar pet
          <input
            type="search"
            value={petStatusSearchTerm}
            onChange={(event) => setPetStatusSearchTerm(event.target.value)}
            placeholder="Nome do pet, tutor ou codigo"
          />
        </label>
        <div className="admin-page-actions admin-user-search-actions">
          <Button type="submit" disabled={loadingPetStatus}>
            {loadingPetStatus ? "Pesquisando..." : "Pesquisar"}
          </Button>
          <Button
            className="melpet-clear-button"
            type="button"
            variant="outline"
            onClick={resetAdminPetSearch}
            disabled={loadingPetStatus}
          >
            Limpar
          </Button>
        </div>
      </form>

      {petStatusError ? <p className="melpet-error">{petStatusError}</p> : null}

      {petStatusSubmitted ? (
        <section className="admin-user-create-section admin-user-search-results-section melpet-admin-pet-results-card">
          <div className="admin-user-section-title">
            <span>Resultado</span>
            <h3>Pets encontrados</h3>
          </div>
          <div className="admin-user-search-results melpet-admin-pet-maintenance-results">
            {loadingPetStatus ? (
              <p>Carregando clientes e pets...</p>
            ) : petStatusResults.length ? (
              petStatusResults.map((cliente) => (
                <article
                  className="melpet-admin-pet-maintenance-client"
                  key={cliente.id}
                >
                  <div className="melpet-admin-pet-maintenance-client-title">
                    <strong>{cliente.nome || "Tutor sem nome"}</strong>
                    <span className="melpet-admin-pet-count-text">
                      {cliente.pets?.length || 0} pet(s)
                    </span>
                  </div>

                  {cliente.pets?.length ? (
                    <div className="melpet-admin-pet-maintenance-pets">
                      {cliente.pets.map((pet) => (
                        <button
                          type="button"
                          className="admin-user-search-result-pick melpet-admin-pet-maintenance-pick"
                          key={pet.id}
                          onClick={() => handleOpenAdminPetFicha(cliente, pet)}
                        >
                          <span className="melpet-admin-pet-result-content">
                            <strong className="melpet-admin-pet-result-name">
                              {pet.nome || "Pet sem nome"}
                            </strong>
                            <span className="melpet-admin-pet-info-badge">
                              <small>{pet.raca || "Tipo nao informado"}</small>
                              <small>
                                {formatPetAge(
                                  calculatePetAgeLabel(pet.dataNascimento),
                                ) || "Idade nao informada"}
                              </small>
                              <small>
                                {formatPetWeight(pet.pesoAproximado) ||
                                  "Peso nao informado"}
                              </small>
                              <em
                                className={
                                  pet.ativo
                                    ? "melpet-client-pet-status melpet-client-pet-status--active"
                                    : "melpet-client-pet-status melpet-client-pet-status--inactive"
                                }
                              >
                                {pet.ativo ? "Ativo" : "Inativo"}
                              </em>
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p>Nenhum pet cadastrado para este tutor.</p>
                  )}
                </article>
              ))
            ) : (
              <p>Nenhum pet encontrado.</p>
            )}
          </div>
        </section>
      ) : null}
    </section>
  );

  const petStatusManagementContent = (
    <section className="melpet-admin-pet-maintenance-layout melpet-admin-pet-status-content">
      <form
        className="admin-user-create-section admin-user-search-section melpet-admin-pet-search-card melpet-admin-pet-status-search-card"
        onSubmit={loadPetStatusSearch}
      >
        <div className="admin-user-section-title">
          <span>Pesquisa</span>
          <h3>Ativar / Inativar Pet</h3>
        </div>
        <label className="admin-user-search-field">
          Buscar pet
          <input
            type="search"
            value={petStatusSearchTerm}
            onChange={(event) => setPetStatusSearchTerm(event.target.value)}
            placeholder="Nome do tutor ou nome do pet"
          />
        </label>
        <div className="admin-page-actions admin-user-search-actions">
          <Button type="submit" disabled={loadingPetStatus}>
            {loadingPetStatus ? "Pesquisando..." : "Pesquisar"}
          </Button>
          <Button
            className="melpet-clear-button"
            type="button"
            variant="outline"
            onClick={resetAdminPetSearch}
            disabled={loadingPetStatus}
          >
            Limpar
          </Button>
        </div>
      </form>

      {petStatusError ? <p className="melpet-error">{petStatusError}</p> : null}

      {petStatusSubmitted ? (
        <section className="admin-user-create-section admin-user-search-results-section melpet-admin-pet-results-card melpet-admin-pet-status-results-card">
          <div className="admin-user-section-title">
            <span>Resultado</span>
            <h3>Pets encontrados</h3>
          </div>
          <div className="admin-user-search-results melpet-admin-pet-status-results">
            {loadingPetStatus ? (
              <p>Carregando clientes e pets...</p>
            ) : petStatusResults.length ? (
              petStatusResults.map((cliente) => (
                <article
                  className="melpet-admin-pet-maintenance-client melpet-admin-pet-status-client"
                  key={cliente.id}
                >
                  <div className="melpet-admin-pet-maintenance-client-title">
                    <strong>{cliente.nome || "Tutor sem nome"}</strong>
                    <span className="melpet-admin-pet-count-text">
                      {cliente.pets?.length || 0} pet(s)
                    </span>
                  </div>

                  {cliente.pets?.length ? (
                    <div className="melpet-admin-pet-maintenance-pets">
                      {cliente.pets.map((pet) => (
                        <article
                          className="melpet-admin-pet-maintenance-pick melpet-admin-pet-status-item"
                          key={pet.id}
                        >
                          <span className="melpet-admin-pet-result-content">
                            <strong className="melpet-admin-pet-result-name">
                              {pet.nome || "Pet sem nome"}
                            </strong>
                            <span className="melpet-admin-pet-info-badge">
                              <small>{pet.raca || "Tipo nao informado"}</small>
                              <small>
                                {formatPetAge(
                                  calculatePetAgeLabel(pet.dataNascimento),
                                ) || "Idade nao informada"}
                              </small>
                              <small>
                                {formatPetWeight(pet.pesoAproximado) ||
                                  "Peso nao informado"}
                              </small>
                              <em
                                className={
                                  pet.ativo
                                    ? "melpet-client-pet-status melpet-client-pet-status--active"
                                    : "melpet-client-pet-status melpet-client-pet-status--inactive"
                                }
                              >
                                {pet.ativo ? "Ativo" : "Inativo"}
                              </em>
                            </span>
                          </span>
                          <Button
                            type="button"
                            variant={pet.ativo ? "danger" : "success"}
                            size="sm"
                            onClick={() => toggleAdminPetStatus(pet)}
                            disabled={savingPetStatusId === pet.id}
                          >
                            {savingPetStatusId === pet.id
                              ? "Salvando..."
                              : pet.ativo
                                ? "Inativar"
                                : "Ativar"}
                          </Button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p>Nenhum pet cadastrado para este tutor.</p>
                  )}
                </article>
              ))
            ) : (
              <p>Nenhum pet encontrado.</p>
            )}
          </div>
        </section>
      ) : null}
    </section>
  );
  const petAdminMenus = new Set([
    "cadastroPets",
    "aprovarCarteiraVacinacao",
    "vacinasOutros",
    "ativarInativarPet",
  ]);
  const isPetAdminMenu =
    petAdminMenus.has(activeMenu) || petAdminMenus.has(initialAdminMenu);
  const isPlanosAdminMenu =
    activeMenu === "controlePlanos" || initialAdminMenu === "controlePlanos";

  const pendingVaccineUsers = buildVaccineUserList(pendingVaccineCards);
  const selectedVaccineUserCards = selectedVaccineUser
    ? pendingVaccineCards.filter(
        (card) => getVaccineUserKey(card) === selectedVaccineUser.key,
      )
    : [];
  const selectedVaccinePetGroups = Array.from(
    selectedVaccineUserCards
      .reduce((groups, card) => {
        const key = String(card?.petId || card?.petNome || card?.id || "");
        const current = groups.get(key) || {
          key,
          petId: card?.petId,
          petNome: card?.petNome || `Pet ${card?.petId}`,
          clienteNome: card?.clienteNome || selectedVaccineUser?.nome || "",
          documentos: {},
          vacinas: Array.isArray(card?.vacinas) ? card.vacinas : [],
        };
        current.documentos[card?.lado === "verso" ? "verso" : "frente"] = card;
        if (!current.vacinas.length && Array.isArray(card?.vacinas)) {
          current.vacinas = card.vacinas;
        }
        groups.set(key, current);
        return groups;
      }, new Map())
      .values(),
  );

  const isPixConfigAdminMenu =
    activeMenu === "configurarPix" || initialAdminMenu === "configurarPix";

  const adminVaccineApprovalContent = (
    <section className="melpet-section-content melpet-admin-vaccine-approval-content">
      <div className="admin-user-create-section melpet-admin-vaccine-pending-card">
        <div className="melpet-admin-vaccine-pending-band">
          <p className="melpet-validate-subtitle">
            Usuários com carteira de vacinação pendente de conferência:
          </p>
          {loadingVaccineCards ? (
            <p className="melpet-validate-message">Carregando carteiras...</p>
          ) : vaccineCardsError ? (
            <p className="melpet-error">{vaccineCardsError}</p>
          ) : pendingVaccineUsers.length ? (
            <ul className="melpet-pending-users-list melpet-admin-vaccine-user-list">
              {pendingVaccineUsers.map((user) => (
                <li key={user.key}>
                  <button
                    type="button"
                    className="melpet-pending-user-btn melpet-admin-vaccine-user-btn"
                    onClick={() => handleOpenVaccineUser(user)}
                  >
                    <span>{user.nome}</span>
                    <em>Abrir</em>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="melpet-validate-message">
              Nenhuma carteira de vacinação pendente no momento.
            </p>
          )}
        </div>
      </div>

      {selectedVaccineUser ? (
        <div className="admin-user-create-section melpet-admin-vaccine-details-card">
          <div className="melpet-vaccine-review-stack">
            {selectedVaccinePetGroups.length ? (
              selectedVaccinePetGroups.map((group) => (
                <article className="melpet-vaccine-review-card" key={group.key}>
                  <header className="melpet-vaccine-review-header">
                    <strong>Cliente {group.clienteNome}</strong>
                    <span>Pet: {group.petNome}</span>
                  </header>

                  <div className="melpet-vaccine-review-docs">
                    {[
                      ["frente", "Documento frente"],
                      ["verso", "Documento verso"],
                    ].map(([side, label]) => {
                      const card = group.documentos[side];
                      const isApproving = approvingVaccineCardId === card?.id;
                      const isRejecting = rejectingVaccineCardId === card?.id;
                      return (
                        <div
                          className="melpet-vaccine-review-doc"
                          key={`${group.key}-${side}`}
                        >
                          <span>{label}</span>
                          {card ? (
                            <div className="melpet-vaccine-review-actions">
                              <button
                                type="button"
                                className="melpet-view-doc-btn"
                                disabled={!buildFileUrl(card.fileUrl)}
                                onClick={() =>
                                  handleOpenDocumentPreview({
                                    fileUrl: card.fileUrl,
                                    nomeDocumento:
                                      card.nomeArquivo ||
                                      getVaccineDocumentName(card),
                                    tipoDocumento: getVaccineDocumentName(card),
                                  })
                                }
                              >
                                Visualizar
                              </button>
                              <button
                                type="button"
                                className="melpet-review-btn melpet-review-btn--approve"
                                disabled={isApproving}
                                onClick={() => handleApproveVaccineCard(card)}
                              >
                                {isApproving ? "Aprovando..." : "Aprovar"}
                              </button>
                              <button
                                type="button"
                                className="melpet-review-btn melpet-review-btn--reject"
                                disabled={isRejecting}
                                onClick={() => openRejectVaccineCardModal(card)}
                              >
                                {isRejecting ? "Reprovando..." : "Reprovar"}
                              </button>
                            </div>
                          ) : (
                            <em>Não enviado</em>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <section className="melpet-vaccine-review-info">
                    <h4>Informações adicionais</h4>
                    {group.vacinas.length ? (
                      <ul>
                        {group.vacinas.map((item) => {
                          const vencimento = item.duracao
                            ? addMonthsToDate(item.dataAplicacao, item.duracao)
                            : "";
                          return (
                            <li key={`${group.key}-${item.configId}`}>
                              <div className="melpet-vaccine-review-vaccine-main">
                                <strong>{item.descricao || "Vacina"}</strong>
                                <em>{item.tipo || "Tipo não informado"}</em>
                              </div>
                              <div className="melpet-vaccine-review-dates">
                                <span>
                                  Data: {formatBrazilDate(item.dataAplicacao)}
                                </span>
                                <span>
                                  Vencimento:{" "}
                                  {vencimento
                                    ? formatBrazilDate(vencimento)
                                    : "Não informado"}
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p>Nenhuma informação preenchida.</p>
                    )}
                  </section>
                </article>
              ))
            ) : (
              <p className="melpet-validate-message">
                Nenhuma carteira de vacinação encontrada.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
  const adminMenuPanels = [
    {
      id: "admin-melpethostel",
      title: isPetAdminMenu
        ? "Cadastro de Pets"
        : isPlanosAdminMenu
          ? "Controle de Planos"
          : isPixConfigAdminMenu
            ? "Configurar PIX"
            : "Mel Pet Hostel",
      summary: isPetAdminMenu
        ? "Acesse as ferramentas administrativas dos pets."
        : isPlanosAdminMenu
          ? "Gerencie os planos do pet hotel."
          : isPixConfigAdminMenu
            ? "Configure a chave PIX global usada nas hospedagens."
            : "Acesse as ferramentas administrativas do pet hotel.",
      ariaLabel: isPetAdminMenu
        ? "Cadastro de Pets"
        : isPlanosAdminMenu
          ? "Controle de Planos"
          : isPixConfigAdminMenu
            ? "Configurar PIX"
            : "Menu da Mel Pet Hostel",
      items: isPetAdminMenu
        ? [
            {
              id: "pesquisar-pets",
              title: "Pesquisar Pets",
              summary:
                "Acesse a ficha do pet, envie carteirinha e preencha vacinas.",
              onAction: () => {
                resetAdminPetSearch();
                setActiveMenu("pesquisarPets");
              },
            },
            {
              id: "aprovar-carteira-vacinacao",
              title: "Aprovar Carteira de Vacinação",
              summary: "Conferir e aprovar carteiras enviadas pelos tutores.",
              onAction: () => {
                setSelectedVaccineUser(null);
                setActiveMenu("aprovarCarteiraVacinacao");
              },
            },
            {
              id: "vacinas-outros",
              title: "Criação e Edição de Vacinas / Outros",
              summary: "Gerenciar cadastros auxiliares de vacinação.",
              onAction: () => {
                resetVaccineConfigForm();
                setActiveMenu("vacinasOutros");
              },
            },
            {
              id: "ativar-inativar-pet",
              title: "Ativar / Inativar Pet",
              summary: "Alterar a situação cadastral dos pets.",
              onAction: () => {
                resetAdminPetSearch();
                setPetStatusError("");
                setActiveMenu("ativarInativarPet");
              },
            },
          ]
        : isPlanosAdminMenu
          ? [
              {
                id: "cadastro-planos",
                title: "Cadastro de Planos",
                summary: "Cadastre tipos, categorias e valores dos planos.",
                isOpen: activeMenu === "controlePlanos",
                onAction: () => {
                  setActiveMenu((prev) =>
                    prev === "controlePlanos" ? "" : "controlePlanos",
                  );
                },
                content: planosContent,
              },
            ]
          : isPixConfigAdminMenu
            ? []
            : [
                {
                  id: "aprovar-hospedagens",
                  title: "Aprovar Hospedagens",
                  summary: "Conferir e aprovar hospedagens pendentes.",
                  isOpen: activeMenu === "aprovarHospedagens",
                  onAction: () => {
                    const shouldOpen = activeMenu !== "aprovarHospedagens";
                    setActiveMenu(shouldOpen ? "aprovarHospedagens" : "");
                    setSelectedPendingHostingId(null);
                    if (shouldOpen) {
                      loadPendingHostingRequests();
                    } else {
                      setPendingHostingRequests([]);
                      setPendingHostingRequestsError("");
                    }
                  },
                  content: adminHostingApprovalContent,
                },
                {
                  id: "analise-comprovantes",
                  title: "Análise de Comprovantes",
                  summary:
                    "Conferir comprovantes de pagamento das hospedagens.",
                  isOpen: activeMenu === "analisarComprovantes",
                  onAction: () => {
                    setActiveMenu((prev) =>
                      prev === "analisarComprovantes"
                        ? ""
                        : "analisarComprovantes",
                    );
                    loadPendingHostingPaymentReceipts();
                  },
                  content: adminHostingPaymentReviewContent,
                },
                {
                  id: "enviar-link-pagamento",
                  title: "Enviar Link de Pagamento",
                  summary: "Enviar link de cartão de crédito para o tutor.",
                  isOpen: activeMenu === "enviarLinkPagamento",
                  onAction: () => {
                    const shouldOpen = activeMenu !== "enviarLinkPagamento";
                    setActiveMenu(shouldOpen ? "enviarLinkPagamento" : "");
                    if (shouldOpen) loadPendingCardPaymentRequests();
                  },
                  content: adminCardPaymentLinkContent,
                },
                {
                  id: "fazer-check-in",
                  title: "Fazer Check-in",
                  summary: "Confirmar check-in de hospedagens liberadas.",
                  isOpen: activeMenu === "fazerCheckin",
                  onAction: () => {
                    const shouldOpen = activeMenu !== "fazerCheckin";
                    setActiveMenu(shouldOpen ? "fazerCheckin" : "");
                    if (shouldOpen) loadPendingHostingCheckinRequests();
                  },
                  content: adminHostingCheckinContent,
                },
              ],
      children: isPixConfigAdminMenu ? adminPixConfigContent : null,
      after: (
        <div className="pet-main-actions melpet-back-actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleMelPetBack("main")}
            className="melpet-back-button"
          >
            Voltar
          </Button>
        </div>
      ),
    },
  ];

  const deletePetModal = (
    <Modal
      isOpen={Boolean(pendingDeletePet)}
      onClose={closeDeletePetModal}
      title="Excluir Pet"
      closeOnBackdropClick={!deletingPetId}
      showCloseButton={!deletingPetId}
      containerStyle={{ width: "min(94%, 520px)" }}
    >
      <div className="admin-page-delete-modal melpet-delete-pet-modal">
        <p>
          Excluir o Pet irá excluir o cadastro e todos os documentos vinculados
          a ele.
          <br /> Quer realmente prosseguir?
        </p>

        {pendingDeletePet?.nome ? (
          <strong className="melpet-delete-pet-name">
            {" "}
            Nome do Pet: <p> {pendingDeletePet.nome} </p>
          </strong>
        ) : null}

        <div className="modal-actions">
          <Button
            type="button"
            variant="outline"
            onClick={closeDeletePetModal}
            disabled={Boolean(deletingPetId)}
          >
            Não
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={confirmDeletePet}
            disabled={Boolean(deletingPetId)}
          >
            {deletingPetId ? "Excluindo..." : "SIM, EXCLUIR"}
          </Button>
        </div>
      </div>
    </Modal>
  );

  const rejectVaccineCardModal = (
    <Modal
      isOpen={Boolean(rejectVaccineCardTarget)}
      onClose={closeRejectVaccineCardModal}
      title="Reprovar Carteira de Vacinação"
      closeOnBackdropClick={!rejectingVaccineCardId}
      showCloseButton={!rejectingVaccineCardId}
      containerStyle={{ width: "min(94%, 520px)" }}
    >
      <div className="melpet-reject-vaccine-modal">
        <p>
          Informe o motivo da reprovação. Esse texto será exibido ao cliente
          para orientar o novo envio.
        </p>
        <label className="pet-form-field">
          Motivo da reprovação
          <textarea
            value={rejectVaccineReason}
            onChange={(event) => setRejectVaccineReason(event.target.value)}
            rows={4}
            disabled={Boolean(rejectingVaccineCardId)}
            placeholder="Ex.: documento ilegível, data não informada, vacina vencida..."
          />
        </label>
        <div className="modal-actions">
          <Button
            type="button"
            variant="outline"
            onClick={closeRejectVaccineCardModal}
            disabled={Boolean(rejectingVaccineCardId)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={submitRejectVaccineCard}
            disabled={Boolean(rejectingVaccineCardId)}
          >
            {rejectingVaccineCardId ? "Reprovando..." : "Reprovar"}
          </Button>
        </div>
      </div>
    </Modal>
  );

  const rejectHostingModalBusy = Boolean(
    rejectHostingTarget && reviewingHostingRequestId === rejectHostingTarget.id,
  );
  const rejectHostingModal = (
    <Modal
      isOpen={Boolean(rejectHostingTarget)}
      onClose={closeRejectHostingModal}
      title="Reprovar Hospedagem"
      closeOnBackdropClick={!rejectHostingModalBusy}
      showCloseButton={!rejectHostingModalBusy}
      containerStyle={{ width: "min(94%, 520px)" }}
    >
      <div className="melpet-reject-vaccine-modal melpet-reject-document-modal">
        <p>
          Informe o motivo da reprovação. Esse texto será exibido ao cliente.
        </p>
        <label className="pet-form-field">
          Motivo da reprovação
          <textarea
            value={rejectHostingReason}
            onChange={(event) => setRejectHostingReason(event.target.value)}
            rows={4}
            disabled={rejectHostingModalBusy}
            placeholder="Ex.: agenda indisponível para o período solicitado..."
          />
        </label>
        <div className="modal-actions">
          <Button
            type="button"
            variant="outline"
            onClick={closeRejectHostingModal}
            disabled={rejectHostingModalBusy}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={rejectHostingRequest}
            disabled={rejectHostingModalBusy}
          >
            {rejectHostingModalBusy ? "Reprovando..." : "Reprovar"}
          </Button>
        </div>
      </div>
    </Modal>
  );

  const rejectHostingPaymentModalBusy = Boolean(
    rejectHostingPaymentTarget &&
    approvingHostingPaymentId === rejectHostingPaymentTarget.id,
  );
  const rejectHostingPaymentModal = (
    <Modal
      isOpen={Boolean(rejectHostingPaymentTarget)}
      onClose={closeRejectHostingPaymentModal}
      title="Recusar Comprovante"
      closeOnBackdropClick={false}
      showCloseButton={false}
      containerStyle={{ width: "min(94%, 520px)" }}
    >
      <div className="melpet-reject-vaccine-modal melpet-reject-document-modal">
        <p>
          Informe o motivo da recusa. Esse texto será exibido ao cliente para
          orientar o novo envio.
        </p>
        <label className="pet-form-field">
          Motivo da recusa
          <textarea
            value={rejectHostingPaymentReason}
            onChange={(event) =>
              setRejectHostingPaymentReason(event.target.value)
            }
            rows={4}
            disabled={rejectHostingPaymentModalBusy}
            placeholder="Ex.: comprovante ilegível, valor divergente, pagamento não identificado..."
          />
        </label>
        <div className="modal-actions">
          <Button
            type="button"
            variant="outline"
            onClick={closeRejectHostingPaymentModal}
            disabled={rejectHostingPaymentModalBusy}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={rejectHostingPaymentReceipt}
            disabled={rejectHostingPaymentModalBusy}
          >
            {rejectHostingPaymentModalBusy ? "Recusando..." : "Recusar"}
          </Button>
        </div>
      </div>
    </Modal>
  );

  const paymentPreviewModal = (
    <Modal
      isOpen={Boolean(paymentPreview)}
      onClose={() => setPaymentPreview(null)}
      title={paymentPreview?.title || "Visualizar comprovante"}
      containerStyle={{ width: "min(96vw, 980px)" }}
    >
      <div className="melpet-preview-modal-body">
        {paymentPreview?.contentType?.startsWith("image/") ? (
          <img
            className="melpet-payment-preview-image"
            src={paymentPreview.imageSrc}
            alt={paymentPreview.title || "Comprovante"}
          />
        ) : paymentPreview?.src ? (
          <PdfViewer src={paymentPreview.src} title={paymentPreview.title} />
        ) : null}
      </div>
    </Modal>
  );
  if (isAdmin && activeMenu === "ativarInativarPet") {
    return (
      <>
        <main className="admin-page admin-user-create-page melpet-admin-pet-search-page melpet-admin-pet-status-page">
          <div className="admin-page-panel admin-page-form admin-user-create-card melpet-admin-pet-search-window melpet-admin-pet-status-window">
            <header className="admin-user-create-header">
              <div className="admin-user-create-heading">
                <span>Mel Pet Hostel</span>
                <h2>Ativar / Inativar Pet</h2>
              </div>
              <p className="admin-user-create-subtitle">
                Consulte o tutor ou pet e altere a situação cadastral quando
                necessário.
              </p>
            </header>

            {petStatusManagementContent}

            <div className="admin-page-actions admin-user-create-actions melpet-admin-pet-search-page-actions melpet-back-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleMelPetBack("petAdminMenu")}
                className="melpet-back-button"
              >
                Voltar
              </Button>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (isAdmin && activeMenu === "vacinasOutros") {
    return (
      <>
        <main className="admin-page admin-user-create-page melpet-admin-pet-search-page melpet-admin-vaccine-config-page">
          <div className="admin-page-panel admin-page-form admin-user-create-card melpet-admin-pet-search-window melpet-admin-vaccine-config-window">
            <header className="admin-user-create-header">
              <div className="admin-user-create-heading">
                <span>Mel Pet Hostel</span>
                <h2>Criação e Edição de Vacinas / Outros</h2>
              </div>
              <p className="admin-user-create-subtitle">
                Cadastre e organize os itens de vacinação usados nas fichas dos
                pets.
              </p>
            </header>

            {vaccineManagementContent}

            <div className="admin-page-actions admin-user-create-actions melpet-admin-pet-search-page-actions melpet-back-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleMelPetBack("petAdminMenu")}
                className="melpet-back-button"
              >
                Voltar
              </Button>
            </div>
          </div>
        </main>
        <Modal
          isOpen={Boolean(deleteWarningVaccineConfig)}
          onClose={cancelDeleteVaccineConfig}
          title="Atenção"
          closeOnBackdropClick={false}
          showCloseButton={false}
          containerStyle={{ width: "min(94%, 520px)" }}
        >
          <div className="admin-page-delete-modal">
            <p>
              Atenção!! Ao clicar em CONFIRMAR, você irá excluir este item de
              vacinas / outros:{" "}
              <strong>{deleteWarningVaccineConfig?.descricao}</strong>. Ele não
              aparecerá mais para novos cadastros.
            </p>

            <div className="modal-actions">
              <Button
                type="button"
                variant="danger"
                onClick={() =>
                  acknowledgeDeleteVaccineConfig(deleteWarningVaccineConfig)
                }
              >
                OK
              </Button>
            </div>
          </div>
        </Modal>
      </>
    );
  }

  if (isAdmin && activeMenu === "aprovarCarteiraVacinacao") {
    return (
      <>
        <main className="admin-page admin-user-create-page melpet-admin-pet-search-page melpet-admin-vaccine-approval-page">
          <div className="admin-page-panel admin-page-form admin-user-create-card melpet-admin-pet-search-window melpet-admin-vaccine-approval-window">
            <header className="admin-user-create-header">
              <div className="admin-user-create-heading">
                <span>Mel Pet Hostel</span>
                <h2>Aprovar Carteira de Vacinação</h2>
              </div>
              <p className="admin-user-create-subtitle">
                Confira carteirinhas enviadas pelos tutores e aprove ou reprove
                cada documento.
              </p>
            </header>

            {adminVaccineApprovalContent}

            <div className="admin-page-actions admin-user-create-actions melpet-admin-pet-search-page-actions melpet-back-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleMelPetBack("petAdminMenu")}
                className="melpet-back-button"
              >
                Voltar
              </Button>
            </div>
          </div>
        </main>
        {rejectVaccineCardModal}
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

  if (isAdmin && activeMenu === "pesquisarPets" && !selectedAdminPet) {
    return (
      <>
        <main className="admin-page admin-user-create-page melpet-admin-pet-search-page">
          <div className="admin-page-panel admin-page-form admin-user-create-card melpet-admin-pet-search-window">
            <header className="admin-user-create-header">
              <div className="admin-user-create-heading">
                <span>Mel Pet Hostel</span>
                <h2>Pesquisar Pets</h2>
              </div>
              <p className="admin-user-create-subtitle">
                Pesquise um pet pelo nome, tutor ou codigo e acesse a ficha
                completa.
              </p>
            </header>

            {adminPetSearchContent}

            <div className="admin-page-actions admin-user-create-actions melpet-admin-pet-search-page-actions melpet-back-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleMelPetBack("petAdminMenu")}
                className="melpet-back-button"
              >
                Voltar
              </Button>
            </div>
          </div>
        </main>
        {deletePetModal}
      </>
    );
  }

  if (
    isAdmin &&
    activeMenu === "pesquisarPets" &&
    selectedAdminPet &&
    petDocsPet?.id === selectedAdminPet.id
  ) {
    return (
      <>
        <main className="melpet-admin-standalone-screen">
          <section className="melpet-admin-pet-screen">
            <article className="melpet-admin-pet-card">
              <header className="melpet-admin-pet-card-header">
                <div className="melpet-admin-pet-heading">
                  <h3>{selectedAdminPet.nome || "Pet sem nome"}</h3>
                </div>
                <em
                  className={`melpet-client-pet-status ${
                    selectedAdminPet.ativo
                      ? "melpet-client-pet-status--active"
                      : "melpet-client-pet-status--inactive"
                  }`}
                >
                  {selectedAdminPet.ativo ? "Ativo" : "Inativo"}
                </em>
              </header>

              <section
                className="melpet-admin-pet-overview"
                aria-label="Resumo do tutor"
              >
                <article>
                  <span>Tutor</span>
                  <strong>
                    {selectedAdminPet.tutorNome || "Tutor nao informado"}
                  </strong>
                  <small>
                    {selectedAdminPet.tutorTelefone || "Telefone nao informado"}
                  </small>
                </article>
                <article>
                  <span>Documentos do Tutor</span>
                  <strong>
                    CPF:{" "}
                    {selectedAdminPet.tutorCpf
                      ? maskCpf(selectedAdminPet.tutorCpf)
                      : "nao informado"}
                  </strong>
                  <small>
                    RG: {selectedAdminPet.tutorRg || "nao informado"}
                  </small>
                </article>
              </section>

              <section className="melpet-admin-pet-info-section">
                <header>
                  <span>Dados cadastrais</span>
                </header>
                <dl className="melpet-admin-pet-info-grid">
                  <div>
                    <dt>Data de nascimento</dt>
                    <dd>{formatBrazilDate(selectedAdminPet.dataNascimento)}</dd>
                  </div>
                  <div>
                    <dt>Idade</dt>
                    <dd>
                      {calculatePetAgeLabel(selectedAdminPet.dataNascimento) ||
                        "-"}
                    </dd>
                  </div>
                  <div>
                    <dt>Peso</dt>
                    <dd>{selectedAdminPet.pesoAproximado || "-"} Kg</dd>
                  </div>
                  <div>
                    <dt>Raça</dt>
                    <dd>{selectedAdminPet.raca || "-"}</dd>
                  </div>
                </dl>
              </section>

              <section className="melpet-admin-pet-emergency-section">
                <header>
                  <span>Emergência</span>
                </header>
                <dl className="melpet-admin-pet-info-grid">
                  <div>
                    <dt>Veterinário</dt>
                    <dd>{selectedAdminPet.ficha?.veterinarioNome || "-"}</dd>
                  </div>
                  <div>
                    <dt>Clínica</dt>
                    <dd>{selectedAdminPet.ficha?.clinicaNome || "-"}</dd>
                  </div>
                  <div>
                    <dt>Telefone</dt>
                    <dd>{selectedAdminPet.ficha?.clinicaTelefone || "-"}</dd>
                  </div>
                  <div>
                    <dt>Endereço</dt>
                    <dd>{selectedAdminPet.ficha?.clinicaEndereco || "-"}</dd>
                  </div>
                </dl>
              </section>

              <section className="melpet-admin-pet-docs-section">
                <header>
                  <span>Carteirinha e vacinas</span>
                </header>
                {renderAdminPetVaccineContent()}
              </section>

              <section className="melpet-admin-pet-anamnesis-section">
                <header>
                  <span>Ficha de anamnese</span>
                </header>
                {getFilledAnamnesisGroups(selectedAdminPet).length ? (
                  <div className="melpet-admin-anamnesis-groups">
                    {getFilledAnamnesisGroups(selectedAdminPet).map((group) => (
                      <article
                        key={group.title}
                        className={
                          normalizeText(group.title).includes("veracidade")
                            ? "melpet-admin-anamnesis-group--full"
                            : undefined
                        }
                      >
                        <h4>{group.title}</h4>
                        <dl>
                          {group.items.map((item) => (
                            <div key={item.label}>
                              <dt>{item.label}</dt>
                              <dd>{item.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p>Nenhuma informação de anamnese preenchida.</p>
                )}
              </section>

              <footer className="admin-page-actions admin-user-create-actions melpet-admin-pet-search-page-actions melpet-back-actions melpet-admin-pet-footer">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleMelPetBack("adminPetSearch")}
                  className="melpet-back-button"
                >
                  Voltar
                </Button>
              </footer>
            </article>
          </section>
        </main>
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

  if (isAdmin && activeMenu === "registrarPresenca") {
    return (
      <main className="melpet-admin-pet-search-page melpet-admin-presence-page">
        <section className="melpet-panel melpet-admin-pet-search-window melpet-admin-presence-window">
          <div className="melpet-admin-pet-maintenance-layout">
            {adminPresenceContent}
            {!activePresencePetId ? (
              <footer className="admin-page-actions admin-user-create-actions melpet-admin-pet-search-page-actions melpet-back-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleMelPetBack("main")}
                  className="melpet-back-button"
                >
                  Voltar
                </Button>
              </footer>
            ) : null}
          </div>
        </section>
      </main>
    );
  }
  if (!isAdmin && userMenu === "controlePresenca") {
    return (
      <>
        {activePresencePetId ? (
          renderPresenceDetail()
        ) : (
          <MenuTemplate
            className="melpet-user-hosting-menu melpet-user-presence-menu"
            panels={userPresencePanels}
          />
        )}
        {deletePetModal}
      </>
    );
  }

  if (!isAdmin && userMenu === "extratoPagamentos") {
    return (
      <>
        <MenuTemplate
          className="melpet-user-hosting-menu"
          panels={[
            {
              id: "extrato-pagamentos",
              ariaLabel: "Extrato de Pagamentos",
              children: paymentStatementContent,
            },
          ]}
        />
        {paymentPreviewModal}
        {deletePetModal}
      </>
    );
  }
  if (!isAdmin && userMenu === "hospedagem") {
    return (
      <>
        <MenuTemplate
          className="melpet-user-hosting-menu"
          panels={hostingPanels}
        />
        {deletePetModal}
      </>
    );
  }

  if (
    shouldRenderPetRegistrationDashboard ||
    shouldRenderUserPetRegistrationDashboard
  ) {
    return (
      <>
        <MenuTemplate
          className="melpet-pet-registration-menu"
          panels={userPetRegistrationPanels}
        />
        {deletePetModal}
      </>
    );
  }

  return (
    <>
      <MenuTemplate
        className="melpet-user-documents-menu"
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
          <></>
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
                      contratoReprovado
                        ? "is-rejected"
                        : contratoDetectado
                          ? "is-done"
                          : "is-pending"
                    }`}
                  >
                    <div className="melpet-upload-doc-main">
                      <div className="melpet-upload-doc-copy">
                        <strong>
                          Contrato assinado - 1 - Envie primeiro o contrato
                        </strong>
                        <span
                          className={`melpet-doc-status melpet-doc-status--${contratoStatusClass}`}
                        >
                          {contratoStatusLabel}
                        </span>
                      </div>

                      {!contratoDetectado || contratoReprovado ? (
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

                    {contratoReprovado ? (
                      <div className="melpet-vaccine-rejection-notice melpet-document-rejection-notice">
                        <strong>Detalhes da reprovacao</strong>
                        <div className="melpet-document-rejection-reason">
                          <span>Motivo:</span>
                          <p>
                            {contratoMotivoReprovacao ||
                              "Motivo nao informado."}
                          </p>
                        </div>
                      </div>
                    ) : null}

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
                        const isUploadingThis = isSupportUploading(field.key);
                        const docStatus = documentStatusByKey[field.key] || {};
                        const statusValue = String(
                          docStatus.status || "pendente",
                        ).toLowerCase();
                        const isRejected = statusValue === "reprovado";
                        const isApproved = statusValue === "aprovado";
                        const isSubmittedForReview = Boolean(
                          docStatus.existsDb && docStatus.existsDisk,
                        );
                        const isConcluded = isSupportDocumentSubmitted(
                          field.key,
                        );
                        const identifiedCount = docStatus.identifiedCount || 0;
                        const supportActionDisabled =
                          isUploadingThis || (field.required && isConcluded);
                        const statusClass = isRejected
                          ? "rejected"
                          : isApproved
                            ? "approved"
                            : isSubmittedForReview
                              ? "pending"
                              : "pending";
                        const statusLabel = isRejected
                          ? "Reprovado"
                          : isApproved
                            ? "Aprovado"
                            : isSubmittedForReview
                              ? "Enviado para conferencia"
                              : "Pendente";
                        return (
                          <li
                            key={field.key}
                            className={`melpet-upload-doc-item ${
                              isRejected
                                ? "is-rejected"
                                : isConcluded
                                  ? "is-done"
                                  : "is-pending"
                            }`}
                          >
                            <div className="melpet-upload-doc-main">
                              <div className="melpet-upload-doc-copy">
                                <strong>{field.label}</strong>
                                {field.required ? (
                                  <span
                                    className={`melpet-doc-status melpet-doc-status--${statusClass}`}
                                  >
                                    {statusLabel}
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
                            {isRejected ? (
                              <div className="melpet-vaccine-rejection-notice melpet-document-rejection-notice">
                                <strong>Detalhes da reprovacao</strong>
                                <div className="melpet-document-rejection-reason">
                                  <span>Motivo:</span>
                                  <p>
                                    {docStatus.motivoReprovacao ||
                                      "Motivo nao informado."}
                                  </p>
                                </div>
                              </div>
                            ) : null}

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
        onSignedContractUpload={handleSignedContractUploadFromModal}
      />

      {deletePetModal}
      {rejectVaccineCardModal}
      {rejectHostingModal}
      {rejectHostingPaymentModal}
      {paymentPreviewModal}

      <Modal
        isOpen={Boolean(deleteWarningVaccineConfig)}
        onClose={cancelDeleteVaccineConfig}
        title="Atenção"
        closeOnBackdropClick={false}
        showCloseButton={false}
        containerStyle={{ width: "min(94%, 520px)" }}
      >
        <div className="admin-page-delete-modal">
          <p>
            Atenção!! Ao clicar em CONFIRMAR, você irá excluir este item de
            vacinas / outros:{" "}
            <strong>{deleteWarningVaccineConfig?.descricao}</strong>. Ele não
            aparecerá mais para novos cadastros.
          </p>

          <div className="modal-actions">
            <Button
              type="button"
              variant="danger"
              onClick={() =>
                acknowledgeDeleteVaccineConfig(deleteWarningVaccineConfig)
              }
            >
              OK
            </Button>
          </div>
        </div>
      </Modal>

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
