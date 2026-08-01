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
    new Map(mapped.map((item) => [normalizeText(item.descricao), item])).values(),
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
  const [selectedVaccineCard, setSelectedVaccineCard] = useState(null);
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
      setActiveMenu(initialAdminMenu === "cadastroPets" ? "" : initialAdminMenu || "");
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
      setSelectedVaccineCard((current) => {
        if (!current) return null;
        return cards.find((card) => card.id === current.id) || null;
      });
    } catch (error) {
      console.error("Erro ao carregar carteiras pendentes:", error);
      setPendingVaccineCards([]);
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
      await api.post(`/melpethostel/pets/carteiras-vacinacao/${id}/aprovar`, {});
      setPendingVaccineCards((current) =>
        (current || []).filter((item) => Number(item.id) !== id),
      );
      setSelectedVaccineCard(null);
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

  function handleOpenVaccineCard(card) {
    setSelectedVaccineCard((current) =>
      current?.id === card?.id ? null : card,
    );
  }

  function handleCloseVaccineCard() {
    setSelectedVaccineCard(null);
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
            error?.message ||
              "Não foi possível carregar os pets cadastrados.",
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
        setPetFormMode("list");
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
      cadastradoEm: createdAt,
      ficha: {
        ...(pet?.ficha || payload),
        sexo: pet?.ficha?.sexo || pet?.sexo || payload.sexo || "",
      },
    };
    setRegisteredPets((current) => [createdPet, ...current]);
    setSelectedPet(null);
    setPetDocsPet(createdPet);
    setPetVaccineResponses({});
    setPetVaccineFiles({ frente: null, verso: null });
    setUploadedPetVaccineSides({ frente: false, verso: false });
    setPetFormMode("list");
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
    if (
      sexo.includes("femea") ||
      sexo.includes("feminino") ||
      sexo === "f"
    ) {
      return "da Pequena";
    }
    return "do Pequeno";
  }

  function handlePetVaccineFile(side, event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!String(file.name || "").toLowerCase().endsWith(".pdf")) {
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
      });
      setUploadedPetVaccineSides((current) => ({ ...current, [side]: true }));
      clearPetVaccineFile(side);
      showToast("Carteirinha enviada com sucesso.", "success");
    } catch (error) {
      showToast(error?.message || "Não foi possível enviar a carteirinha.", "error");
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
      await api.post(
        `/melpethostel/pets/${petDocsPet.id}/vacinas-respostas`,
        { respostas },
      );
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
      after: fluxoObrigatorioPets ? null : (
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

  const petDocumentsContent = petDocsPet ? (
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
          const actionDisabled = Boolean(uploadingPetVaccineSide) || isConcluded;

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
  ) : null;

  const userPetRegistrationPanels = [
    ...petRegistrationPanels,
    ...(petDocumentsContent
      ? [
          {
            id: "pet-vaccination-documents",
            title: "Mel Pet Hostel",
            summary: "Documentos e vacinas do pet.",
            ariaLabel: "Documentos e vacinas do pet",
            children: petDocumentsContent,
          },
        ]
      : []),
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
            <p>Informe um código ou nome, ou clique em pesquisar para listar todos.</p>
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
                <dd>{selectedClient.cpf ? maskCpf(selectedClient.cpf) : "-"}</dd>
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
      <form className="admin-page-panel admin-page-form" onSubmit={saveVaccineConfig}>
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
            <Button type="button" variant="secondary" onClick={addVaccineConfigType}>
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
            <Button type="button" variant="secondary" onClick={resetVaccineConfigForm}>
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
                    {normalizeVaccineTypes(item.tipos, item.duracao).map((tipo) => (
                      <li key={normalizeVaccineType(tipo).descricao}>
                        {getVaccineTypeLabel(tipo)}
                      </li>
                    ))}
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

  const petAdminMenus = new Set([
    "cadastroPets",
    "aprovarCarteiraVacinacao",
    "vacinasOutros",
  ]);
  const isPetAdminMenu =
    petAdminMenus.has(activeMenu) || petAdminMenus.has(initialAdminMenu);

  const adminMenuPanels = [
    {
      id: "admin-melpethostel",
      title: isPetAdminMenu ? "Cadastro de Pets" : "Mel Pet Hostel",
      summary: isPetAdminMenu
        ? "Acesse as ferramentas administrativas dos pets."
        : "Acesse as ferramentas administrativas do pet hotel.",
      ariaLabel: isPetAdminMenu ? "Cadastro de Pets" : "Menu da Mel Pet Hostel",
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
                setSelectedVaccineCard(null);
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
                        Pets com carteira de vacinação pendente de conferência:
                      </p>
                      {loadingVaccineCards ? (
                        <p className="melpet-validate-message">
                          Carregando carteiras...
                        </p>
                      ) : vaccineCardsError ? (
                        <p className="melpet-error">{vaccineCardsError}</p>
                      ) : pendingVaccineCards.length ? (
                        <ul className="melpet-pending-users-list">
                          {pendingVaccineCards.map((card) => (
                            <li key={card.id}>
                              <button
                                type="button"
                                className="melpet-pending-user-btn"
                                onClick={() => handleOpenVaccineCard(card)}
                              >
                                {card.clienteNome ||
                                  `Cliente ${card.clienteId}`}{" "}
                                - {card.petNome || `Pet ${card.petId}`}
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

                {selectedVaccineCard ? (
                  <div className="melpet-outer-card melpet-user-docs-container">
                    <div className="melpet-outer-card-header">
                      <h3>
                        Carteira de vacinação -{" "}
                        {selectedVaccineCard.petNome ||
                          `Pet ${selectedVaccineCard.petId}`}
                      </h3>
                    </div>

                    <div className="melpet-categories-card melpet-docs-card-shell">
                      <div className="melpet-card-body melpet-docs-card-body">
                        <div className="melpet-docs-table-wrap">
                          <table className="melpet-docs-table">
                            <thead>
                              <tr>
                                <th>Cliente</th>
                                <th>Pet</th>
                                <th>Arquivo</th>
                                <th>Visualizar</th>
                                <th>Aprovar</th>
                                <th>Reprovar</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td>
                                  {selectedVaccineCard.clienteNome ||
                                    selectedVaccineCard.clienteId}
                                </td>
                                <td>
                                  {selectedVaccineCard.petNome ||
                                    selectedVaccineCard.petId}
                                </td>
                                <td>{selectedVaccineCard.nomeArquivo}</td>
                                <td>
                                  <button
                                    type="button"
                                    className="melpet-view-doc-btn"
                                    onClick={() =>
                                      handleOpenDocumentPreview({
                                        fileUrl: selectedVaccineCard.fileUrl,
                                        nomeDocumento:
                                          selectedVaccineCard.nomeArquivo,
                                        tipoDocumento:
                                          "Carteira de Vacinação",
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
                                    disabled={
                                      approvingVaccineCardId ===
                                      selectedVaccineCard.id
                                    }
                                    onClick={() =>
                                      handleApproveVaccineCard(
                                        selectedVaccineCard,
                                      )
                                    }
                                  >
                                    {approvingVaccineCardId ===
                                    selectedVaccineCard.id
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
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    <div className="melpet-user-docs-actions">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCloseVaccineCard}
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
