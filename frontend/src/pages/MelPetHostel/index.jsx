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
  initialAdminMenu = "",
  userMenu = "",
  petRegistrationOnly = false,
  contractPromptRequest = 0,
  onPetRegistered,
}) {
  const { usuario, logout } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef(null);
  const supportFileRefs = useRef({});
  const petVaccineFileRefs = useRef({});
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
  const [petDocsPet, setPetDocsPet] = useState(null);
  const [petVaccineConfigs, setPetVaccineConfigs] = useState([]);
  const [petVaccineResponses, setPetVaccineResponses] = useState({});
  const [vaccineCardItems, setVaccineCardItems] = useState([]);
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
  const [hostingMenuOpen, setHostingMenuOpen] = useState(false);
  const [hostingHistoryOpen, setHostingHistoryOpen] = useState(false);
  const [hostingHistoryStatusFilter, setHostingHistoryStatusFilter] = useState("all");
  const [hostingRequestOpenId, setHostingRequestOpenId] = useState(null);
  const [cancelingHostingRequestId, setCancelingHostingRequestId] = useState(null);
  const [hostingPetIds, setHostingPetIds] = useState([]);
  const [hostingPetPeriods, setHostingPetPeriods] = useState({});
  const [sendingHostingRequest, setSendingHostingRequest] = useState(false);
  const [hostingRequests, setHostingRequests] = useState([]);
  const [loadingHostingRequests, setLoadingHostingRequests] = useState(false);
  const [hostingRequestsError, setHostingRequestsError] = useState("");
  const [activeMenu, setActiveMenu] = useState(
    initialAdminMenu === "cadastroPets" ? "" : initialAdminMenu,
  );
  const [clientSearchTerm, setClientSearchTerm] = useState("");
  const [clientSearchOrder, setClientSearchOrder] = useState("codigo_asc");
  const [clientSearchResults, setClientSearchResults] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [loadingClientSearch, setLoadingClientSearch] = useState(false);
  const [clientSearchSubmitted, setClientSearchSubmitted] = useState(false);
  const [clientSearchError, setClientSearchError] = useState("");
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loadingPendingUsers, setLoadingPendingUsers] = useState(false);
  const [pendingUsersError, setPendingUsersError] = useState("");
  const [selectedPendingUser, setSelectedPendingUser] = useState(null);
  const [selectedUserFiles, setSelectedUserFiles] = useState([]);
  const [loadingSelectedUserFiles, setLoadingSelectedUserFiles] =
    useState(false);
  const [selectedUserFilesError, setSelectedUserFilesError] = useState("");
  const [conferindoItemKey, setConferindoItemKey] = useState("");
  const [pendingVaccineCards, setPendingVaccineCards] = useState([]);
  const [loadingVaccineCards, setLoadingVaccineCards] = useState(false);
  const [vaccineCardsError, setVaccineCardsError] = useState("");
  const [selectedVaccineUser, setSelectedVaccineUser] = useState(null);
  const [approvingVaccineCardId, setApprovingVaccineCardId] = useState(null);
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

  const usuarioGrupo =
    (usuario && (usuario.grupoNome || usuario.grupo)) || null;
  const isAdmin = Boolean(
    usuario &&
    (usuario.admin ||
      usuario.isAdmin ||
      (usuario.perfil && String(usuario.perfil).toLowerCase() === "admin") ||
      (usuarioGrupo && String(usuarioGrupo).toLowerCase().includes("admin"))),
  );

  useEffect(() => {
    if (isAdmin) {
      setActiveMenu(
        initialAdminMenu === "cadastroPets" ? "" : initialAdminMenu || "",
      );
    }
  }, [initialAdminMenu, isAdmin]);

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

  function handleCloseVaccineUser() {
    setSelectedVaccineUser(null);
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
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || "-");
    return date.toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
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
    if (normalized.includes("anal") || normalized.includes("aguard")) return "Pendente";
    return "Pendente";
  }

  function getHostingRequestStatusDetail(status) {
    const normalized = normalizeText(status);
    if (normalized.includes("aprov")) return "Pedido aprovado";
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
    if (normalized.includes("recus")) return "rejected";
    if (normalized.includes("anal")) return "review";
    if (normalized.includes("confirm")) return "confirmed";
    if (normalized.includes("conclu")) return "completed";
    if (normalized.includes("cancel")) return "canceled";
    return "pending";
  }

  function getHostingRequestStatusIcon(status) {
    const tone = getHostingRequestStatusTone(status);
    if (tone === "approved") return "✓";
    if (tone === "rejected") return "✕";
    if (tone === "review") return "…";
    if (tone === "confirmed") return "●";
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
    if (normalized.includes("cancel")) return "cancelado";
    return "pendente";
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

  function canCancelHostingRequest(status) {
    const key = getHostingRequestStatusKey(status);
    return key === "pendente" || key === "aguardando_pagamento";
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
        ? parsePlanNumber(pet?.idade)
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
      setHostingMenuOpen(false);
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

  async function loadClientSearch(event) {
    event?.preventDefault();
    setClientSearchSubmitted(true);
    setLoadingClientSearch(true);
    setClientSearchError("");

    try {
      const params = [`ordenar=${encodeURIComponent(clientSearchOrder)}`];
      const trimmedSearch = clientSearchTerm.trim();
      if (trimmedSearch) {
        params.push(`busca=${encodeURIComponent(trimmedSearch)}`);
      }

      const data = await api.get(`/melpethostel/clientes?${params.join("&")}`);
      const clientes = Array.isArray(data?.clientes) ? data.clientes : [];
      setClientSearchResults(clientes);
      setSelectedClient((current) => {
        if (!current) return null;
        return clientes.find((cliente) => cliente.id === current.id) || null;
      });
    } catch (error) {
      setClientSearchResults([]);
      setSelectedClient(null);
      setClientSearchError(error?.message || "Erro ao pesquisar clientes.");
    } finally {
      setLoadingClientSearch(false);
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
    if (activeMenu !== "conferirDocumentos") return;
    loadPendingValidationUsers();
  }, [isAdmin, activeMenu]);

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
    if (isAdmin || userMenu !== "hospedagem") return;
    loadPlanos();
  }, [isAdmin, userMenu]);

  useEffect(() => {
    if (isAdmin || userMenu !== "hospedagem") return;
    loadHostingRequests();
  }, [isAdmin, userMenu, hostingHistoryOpen]);

  useEffect(() => {
    if (!isAdmin || activeMenu !== "pesquisarClientes") return;
    if (!clientSearchSubmitted) return;
    loadClientSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSearchOrder]);

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
          idade: data.pendingPet.idade,
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
        setUploadedPetVaccineSides({
          frente: Array.isArray(data.carteiras)
            ? data.carteiras.some((item) => item.lado === "frente")
            : false,
          verso: Array.isArray(data.carteiras)
            ? data.carteiras.some((item) => item.lado === "verso")
            : false,
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
      idade: pet?.idade || payload.idade,
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
    setUploadedPetVaccineSides({
      frente: Array.isArray(pet?.carteiras)
        ? pet.carteiras.some((item) => item.lado === "frente")
        : false,
      verso: Array.isArray(pet?.carteiras)
        ? pet.carteiras.some((item) => item.lado === "verso")
        : false,
    });

    if (targetMode === "vaccineUpload") {
      setVaccineCardItems([]);
      setVaccineCardInfoError("");
      await loadPetVaccineConfigs();
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
      await fetch(
        `${String(API_URL).replace(/\/+$/, "")}/melpethostel/pets/${encodeURIComponent(pet.id)}/carteira-vacinacao/upload`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
          body: formData,
        },
      ).then(async (response) => {
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
        respostas,
      });
      showToast("Vacinas e outros salvos com sucesso.", "success");
      setPetDocsPet(null);
      onPetRegistered?.();
    } catch (error) {
      showToast(error?.message || "Não foi possível salvar vacinas.", "error");
    } finally {
      setSavingPetVaccines(false);
    }
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

  function getPetVaccineStatus(pet) {
    const carteiras = Array.isArray(pet?.carteiras) ? pet.carteiras : [];
    const hasApproved = carteiras.some(
      (item) => item?.conferido || item?.status === "aprovado",
    );
    if (hasApproved) {
      return { label: "Pet Aprovado", tone: "approved" };
    }

    if (carteiras.length) {
      return { label: "Pendente", tone: "pending" };
    }

    return { label: "Enviar Carteira", tone: "missing" };
  }

  function renderPetVaccineAction(pet) {
    const status = getPetVaccineStatus(pet);

    return (
      <button
        type="button"
        className="melpet-vaccine-card-btn"
        onClick={() => openVaccineCardInfo(pet)}
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

  function renderPetDocumentsContent() {
    if (!petDocsPet) return null;

    return (
      <section className="melpet-pet-documents">
        <p className="pet-registration-required-message">
          Agora é o momento de você nos enviar os documentos{" "}
          {getPetGenderText(petDocsPet)} {petDocsPet.nome}!
        </p>

        <ul className="melpet-upload-doc-list">
          {[
            ["frente", "Carteirinha de vacinação Frente"],
            ["verso", "Carteirinha de vacinação Verso"],
          ].map(([side, label]) => {
            const selectedPetFile = petVaccineFiles[side];
            const isUploadingThis = uploadingPetVaccineSide === side;
            const isConcluded = Boolean(uploadedPetVaccineSides[side]);
            const actionDisabled =
              Boolean(uploadingPetVaccineSide) || isConcluded;

            return (
              <li
                className={`melpet-upload-doc-item ${
                  isConcluded ? "is-done" : "is-pending"
                }`}
                key={side}
              >
                <div className="melpet-upload-doc-main">
                  <div className="melpet-upload-doc-copy">
                    <strong>{label}</strong>
                    <span
                      className={
                        isConcluded
                          ? "melpet-doc-status melpet-doc-status--done"
                          : "melpet-doc-status melpet-doc-status--pending"
                      }
                    >
                      {isConcluded ? "Enviado para conferência" : "Pendente"}
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
                        ? "Enviar"
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
            disabled={savingPetVaccines}
            onClick={savePetVaccineResponses}
          >
            {savingPetVaccines ? "Salvando..." : "Salvar vacinas e outros"}
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
    { key: "aguardando_pagamento", label: "Aguardando pagamento" },
    { key: "confirmado", label: "Confirmado" },
    { key: "concluido", label: "Concluído" },
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
              ? { ...request, status: data.solicitacao.status }
              : request,
          ),
        );
        setHostingRequestOpenId(Number(requestId));
      } else {
        await loadHostingRequests();
      }
      showToast("Solicitação cancelada.", "success");
    } catch (error) {
      showToast(error?.message || "Não foi possível cancelar o pedido.", "error");
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
                              : "selecione um plano"}
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
                <li key={item.pet.id}>
                  <span>
                    <strong>{item.pet.nome}</strong>
                    <small>
                      {item.plano
                        ? item.recurring
                          ? `${item.tipo} / ${item.quantity} ${item.plano.tempoUnidade || "dia"} - início ${formatStartMonth(item.inicioMes)} - mensal`
                          : item.dayUse
                            ? `${item.tipo} / ${formatPlanTempo(item.plano)} - ${formatBrazilDate(item.entrada)} - ${formatCurrency(item.dailyValue)} x 1 dia`
                            : `${item.tipo} / ${formatPlanTempo(item.plano)} - ${formatCurrency(item.dailyValue)} ->
                            ${formatBrazilDate(item.entrada)} a ${formatBrazilDate(item.saida)} x ${item.days || 0} dias`
                        : "Sem valor configurado para este pet"}
                    </small>
                  </span>
                  <strong>{formatCurrency(item.total)}</strong>
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
        <p>
          Veja aqui os pedidos enviados e o andamento de cada solicitação.
        </p>
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
                    </div>
                    <div className="melpet-hosting-history-card-date">
                      <span>Data do pedido</span>
                      <strong>{formatDateTime(request.criadoEm)}</strong>
                    </div>
                  </div>
                  <span
                    className={`melpet-hosting-history-status is-${getHostingRequestStatusTone(request.status)}`}
                  >
                    <strong>{getHostingRequestStatusLabel(request.status)}</strong>
                    <span>{getHostingRequestStatusDetail(request.status)}</span>
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
                        <dt>Total solicitado</dt>
                        <dd>{formatCurrency(requestTotal)}</dd>
                      </div>
                      <div>
                        <dt>Atualizado em</dt>
                        <dd>{formatDateTime(request.atualizadoEm)}</dd>
                      </div>
                    </dl>

                    {hostingHistoryStats.latestRequest?.id === request.id ? (
                      <div className="melpet-hosting-history-highlight">
                        Pedido mais recente
                      </div>
                    ) : null}

                    <div className="melpet-hosting-history-items">
                      <h4>Itens</h4>
                      <ul>
                        {(request.itens || []).map((item) => {
                          const itemTotal = item.valorTotal;
                          return (
                            <li key={item.id}>
                              <strong>{item.petNome || `Pet ${item.petId}`}</strong>
                              <small>
                                {item.tipo} / {item.tempoQuantidade} {item.tempoUnidade} -> {formatCurrency(item.valorDiaria)}
                              </small>
                              <small>{formatHostingItemPeriod(item)}</small>
                              <strong>{formatCurrency(itemTotal)}</strong>
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    {request.motivoRecusa ? (
                      <div className="melpet-hosting-history-note">
                        <strong>Motivo da recusa</strong>
                        <p>{request.motivoRecusa}</p>
                      </div>
                    ) : null}

                    {canCancelHostingRequest(request.status) ? (
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
                            : "Cancelar pedido"}
                        </Button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="melpet-hosting-history-card-summary">
                    {request.tipo || "Hospedagem"} · {formatHostingRequestPeriod(request)} · {formatCurrency(requestTotal)}
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
          isOpen: hostingMenuOpen,
          onAction: () => setHostingMenuOpen((current) => !current),
          content: hostingRequestContent,
        },
        {
          id: "meus-pedidos-hospedagem",
          title: "Meus Pedidos de Hospedagem",
          summary: "Acompanhe as solicitações enviadas.",
          isOpen: hostingHistoryOpen,
          onAction: () => setHostingHistoryOpen((current) => !current),
          content: hostingRequestsContent,
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

  const clientSearchContent = (
    <section className="melpet-client-search">
      <form className="melpet-client-search-form" onSubmit={loadClientSearch}>
        <label>
          Pesquisar cliente
          <input
            type="search"
            value={clientSearchTerm}
            onChange={(event) => setClientSearchTerm(event.target.value)}
            placeholder="Código ou nome do cliente"
          />
        </label>

        <label>
          Ordenar por
          <select
            value={clientSearchOrder}
            onChange={(event) => setClientSearchOrder(event.target.value)}
          >
            <option value="codigo_asc">Código crescente</option>
            <option value="codigo_desc">Código decrescente</option>
            <option value="nome_asc">Nome A-Z</option>
            <option value="nome_desc">Nome Z-A</option>
          </select>
        </label>

        <Button type="submit" disabled={loadingClientSearch}>
          {loadingClientSearch ? "Pesquisando..." : "Pesquisar"}
        </Button>
      </form>

      {clientSearchError ? (
        <p className="melpet-error">{clientSearchError}</p>
      ) : null}

      <div className="melpet-client-search-grid">
        <div className="melpet-client-list">
          {loadingClientSearch ? (
            <p>Carregando clientes...</p>
          ) : clientSearchResults.length ? (
            clientSearchResults.map((cliente) => (
              <button
                type="button"
                key={cliente.id}
                className={
                  selectedClient?.id === cliente.id
                    ? "melpet-client-list-item is-selected"
                    : "melpet-client-list-item"
                }
                onClick={() =>
                  setSelectedClient((current) =>
                    current?.id === cliente.id ? null : cliente,
                  )
                }
              >
                <strong>{cliente.id}</strong>
                <span>
                  {cliente.nome}
                  {cliente.admin ? (
                    <em className="melpet-client-admin-badge">admin</em>
                  ) : null}
                </span>
              </button>
            ))
          ) : clientSearchSubmitted ? (
            <p>Nenhum cliente encontrado.</p>
          ) : (
            <p>
              Informe um código ou nome, ou clique em pesquisar para listar
              todos.
            </p>
          )}
        </div>

        {selectedClient ? (
          <article className="melpet-client-details">
            <h3>
              {selectedClient.nome}
              {selectedClient.admin ? (
                <em className="melpet-client-admin-badge">admin</em>
              ) : null}
            </h3>
            <dl>
              <div>
                <dt>Código</dt>
                <dd>{selectedClient.id}</dd>
              </div>
              <div>
                <dt>CPF</dt>
                <dd>
                  {selectedClient.cpf ? maskCpf(selectedClient.cpf) : "-"}
                </dd>
              </div>
              <div>
                <dt>RG</dt>
                <dd>{selectedClient.rg || "-"}</dd>
              </div>
              <div>
                <dt>Data de nascimento</dt>
                <dd>{selectedClient.data_nascimento || "-"}</dd>
              </div>
              <div>
                <dt>Telefone</dt>
                <dd>{selectedClient.telefone || "-"}</dd>
              </div>
              <div>
                <dt>WhatsApp</dt>
                <dd>{selectedClient.whatsapp || "-"}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{selectedClient.email || "-"}</dd>
              </div>
              <div>
                <dt>Observações</dt>
                <dd>{selectedClient.observacoes || "-"}</dd>
              </div>
            </dl>

            <div className="melpet-client-detail-block">
              <h4>Endereços</h4>
              {selectedClient.enderecos?.length ? (
                <ul>
                  {selectedClient.enderecos.map((endereco) => (
                    <li key={endereco.id || formatAddress(endereco)}>
                      {formatAddress(endereco)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nenhum endereço cadastrado.</p>
              )}
            </div>

            <div className="melpet-client-detail-block">
              <h4>Pets</h4>
              {selectedClient.pets?.length ? (
                <ul>
                  {selectedClient.pets.map((pet) => (
                    <li key={pet.id}>{pet.nome}</li>
                  ))}
                </ul>
              ) : (
                <p>Nenhum pet cadastrado.</p>
              )}
            </div>
          </article>
        ) : null}
      </div>
    </section>
  );

  const vaccineManagementContent = (
    <section className="melpet-vaccine-admin-stack">
      <form
        className="admin-page-panel admin-page-form"
        onSubmit={saveVaccineConfig}
      >
        <div className="admin-page-panel-title">
          <span>{editingVaccineConfigId ? "Editando" : "Novo item"}</span>
          <h3>
            {editingVaccineConfigId
              ? vaccineConfigForm.descricao || "Editar item"
              : "Criar vacina / outro"}
          </h3>
        </div>

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
              Cancelar edicao
            </Button>
          ) : null}
          <Button type="submit" disabled={savingVaccineConfig}>
            {savingVaccineConfig
              ? "Salvando..."
              : editingVaccineConfigId
                ? "Salvar alteracoes"
                : "Criar item"}
          </Button>
        </div>
      </form>

      <section className="admin-page-panel">
        <div className="admin-page-panel-title">
          <span>Vacinas / Outros</span>
          <h3>Itens cadastrados</h3>
        </div>

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

  const petAdminMenus = new Set([
    "cadastroPets",
    "aprovarCarteiraVacinacao",
    "vacinasOutros",
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

  const adminMenuPanels = [
    {
      id: "admin-melpethostel",
      title: isPetAdminMenu
        ? "Cadastro de Pets"
        : isPlanosAdminMenu
          ? "Controle de Planos"
          : "Mel Pet Hostel",
      summary: isPetAdminMenu
        ? "Acesse as ferramentas administrativas dos pets."
        : isPlanosAdminMenu
          ? "Gerencie os planos do pet hotel."
          : "Acesse as ferramentas administrativas do pet hotel.",
      ariaLabel: isPetAdminMenu
        ? "Cadastro de Pets"
        : isPlanosAdminMenu
          ? "Controle de Planos"
          : "Menu da Mel Pet Hostel",
      items: isPetAdminMenu
        ? [
            {
              id: "aprovar-carteira-vacinacao",
              title: "Aprovar Carteira de Vacinação",
              summary: "Conferir e aprovar carteiras enviadas pelos tutores.",
              isOpen: activeMenu === "aprovarCarteiraVacinacao",
              onAction: () => {
                setActiveMenu((prev) =>
                  prev === "aprovarCarteiraVacinacao"
                    ? ""
                    : "aprovarCarteiraVacinacao",
                );
                setSelectedVaccineUser(null);
              },
            },
            {
              id: "vacinas-outros",
              title: "Criação e Edição de Vacinas / Outros",
              summary: "Gerenciar cadastros auxiliares de vacinação.",
              isOpen: activeMenu === "vacinasOutros",
              onAction: () => {
                setActiveMenu((prev) =>
                  prev === "vacinasOutros" ? "" : "vacinasOutros",
                );
                resetVaccineConfigForm();
              },
              content: vaccineManagementContent,
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
          : [
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
                id: "pesquisar-clientes",
                title: "Pesquisar Cliente",
                summary:
                  "Pesquise por código ou nome e confira cadastro, endereço e pets.",
                isOpen: activeMenu === "pesquisarClientes",
                onAction: () => {
                  setActiveMenu((prev) =>
                    prev === "pesquisarClientes" ? "" : "pesquisarClientes",
                  );
                  setSelectedPendingUser(null);
                  setSelectedUserFiles([]);
                  setSelectedUserFilesError("");
                },
                content: clientSearchContent,
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

  if (!isAdmin && userMenu === "hospedagem") {
    return <MenuTemplate panels={hostingPanels} />;
  }

  if (
    shouldRenderPetRegistrationDashboard ||
    shouldRenderUserPetRegistrationDashboard
  ) {
    return <MenuTemplate panels={userPetRegistrationPanels} />;
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
            {isAdmin && activeMenu === "aprovarCarteiraVacinacao" ? (
              <section className="melpet-section-content">
                <div className="melpet-outer-card melpet-validate-card">
                  <div className="melpet-outer-card-header">
                    <h3>Aprovar Carteira de Vacinação</h3>
                  </div>

                  <div className="melpet-categories-card">
                    <div className="melpet-card-body">
                      <p className="melpet-validate-subtitle">
                        Usuários com carteira de vacinação pendente de
                        conferência:
                      </p>
                      {loadingVaccineCards ? (
                        <p className="melpet-validate-message">
                          Carregando carteiras...
                        </p>
                      ) : vaccineCardsError ? (
                        <p className="melpet-error">{vaccineCardsError}</p>
                      ) : pendingVaccineUsers.length ? (
                        <ul className="melpet-pending-users-list">
                          {pendingVaccineUsers.map((user) => (
                            <li key={user.key}>
                              <button
                                type="button"
                                className="melpet-pending-user-btn"
                                onClick={() => handleOpenVaccineUser(user)}
                              >
                                {user.nome}
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
                </div>

                {selectedVaccineUser ? (
                  <div className="melpet-outer-card melpet-user-docs-container">
                    <div className="melpet-outer-card-header">
                      <h3>
                        Carteiras de vacinação de{" "}
                        {selectedVaccineUser?.nome || "usuário"}
                      </h3>
                    </div>

                    <div className="melpet-categories-card melpet-docs-card-shell">
                      <div className="melpet-card-body melpet-docs-card-body">
                        <div className="melpet-docs-table-wrap">
                          <table className="melpet-docs-table melpet-vaccine-docs-table">
                            <thead>
                              <tr>
                                <th>Nome do documento</th>
                                <th>Pet</th>
                                <th>Visualizar</th>
                                <th>Aprovar</th>
                                <th>Reprovar</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedVaccineUserCards.length ? (
                                selectedVaccineUserCards.map((card) => {
                                  const url = buildFileUrl(card.fileUrl);
                                  const isApproving =
                                    approvingVaccineCardId === card.id;
                                  return (
                                    <tr key={card.id}>
                                      <td>{getVaccineDocumentName(card)}</td>
                                      <td>
                                        {card.petNome || `Pet ${card.petId}`}
                                      </td>
                                      <td>
                                        <button
                                          type="button"
                                          className="melpet-view-doc-btn"
                                          disabled={!url}
                                          onClick={() =>
                                            handleOpenDocumentPreview({
                                              fileUrl: card.fileUrl,
                                              nomeDocumento:
                                                card.nomeArquivo ||
                                                getVaccineDocumentName(card),
                                              tipoDocumento:
                                                getVaccineDocumentName(card),
                                            })
                                          }
                                        >
                                          Visualizar documento
                                        </button>
                                      </td>
                                      <td>
                                        <button
                                          type="button"
                                          className="melpet-review-btn melpet-review-btn--approve"
                                          disabled={isApproving}
                                          onClick={() =>
                                            handleApproveVaccineCard(card)
                                          }
                                        >
                                          {isApproving
                                            ? "Aprovando..."
                                            : "Aprovar"}
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
                                })
                              ) : (
                                <tr>
                                  <td colSpan={5}>
                                    Nenhuma carteira de vacinação encontrada.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    <div className="melpet-user-docs-actions">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCloseVaccineUser}
                      >
                        Fechar
                      </Button>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

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
