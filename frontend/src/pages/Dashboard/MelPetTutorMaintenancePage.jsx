import { useEffect, useMemo, useState } from "react";
import { Button, Modal, PdfViewer } from "../../components";
import { useToast } from "../../components/Toast/ToastContext";
import api from "../../services/api";
import { maskCpf } from "../../utils/brFields";

function formatBrazilDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10) || "-";
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatAddress(address) {
  return [address.logradouro, address.numero, address.complemento, address.bairro, address.cidade, address.uf || address.estado, address.cep]
    .filter(Boolean)
    .join(", ");
}

function buildDocumentPreviewUrl(file) {
  const tipo = file?.tipoRegistro === "contrato" ? "contrato" : "documento";
  const id = tipo === "contrato" ? Number(file?.contratoId) : Number(file?.documentoId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const params = new window.URLSearchParams({ tipo, id: String(id) });
  return "/melpethostel/documentos/preview?" + params.toString();
}

function getTutorClienteId(tutor) {
  const id = Number(tutor?.id ?? tutor?.clienteId ?? tutor?.cliente_id ?? tutor?.Cliente_ID ?? tutor?.codigo);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function MelPetTutorMaintenancePage({ onBack }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchOrder, setSearchOrder] = useState("nome_asc");
  const [results, setResults] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedTutor, setSelectedTutor] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [pendingTutors, setPendingTutors] = useState([]);
  const [loadingPendingTutors, setLoadingPendingTutors] = useState(false);
  const [pendingTutorsError, setPendingTutorsError] = useState("");
  const [selectedPendingTutor, setSelectedPendingTutor] = useState(null);
  const [pendingTutorFiles, setPendingTutorFiles] = useState([]);
  const [loadingPendingTutorFiles, setLoadingPendingTutorFiles] = useState(false);
  const [pendingTutorFilesError, setPendingTutorFilesError] = useState("");
  const [uploadType, setUploadType] = useState("contrato");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewSrc, setPreviewSrc] = useState("");
  const [busyDocumentKey, setBusyDocumentKey] = useState("");
  const [processedDocumentKeys, setProcessedDocumentKeys] = useState([]);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const { showToast } = useToast();

  const selectedPets = useMemo(() => (Array.isArray(selectedTutor?.pets) ? selectedTutor.pets : []), [selectedTutor]);

  useEffect(() => {
    loadPendingTutors();
  }, []);

  async function loadPendingTutors() {
    setLoadingPendingTutors(true);
    setPendingTutorsError("");
    try {
      const data = await api.get("/melpethostel/documentos/pendentes");
      const tutors = Array.isArray(data?.usuarios) ? data.usuarios : [];
      const enrichedTutors = await Promise.all(
        tutors.map(async (tutor) => {
          if (!tutor?.usuarioId) return tutor;
          try {
            const filesData = await api.get(
              "/melpethostel/documentos/usuario/" +
                encodeURIComponent(tutor.usuarioId) +
                "/arquivos",
            );
            const pendingFiles = Array.isArray(filesData?.arquivos)
              ? filesData.arquivos.filter((file) => !file.conferido && file.status !== "reprovado")
              : [];
            return { ...tutor, documentosPendentes: pendingFiles };
          } catch {
            return { ...tutor, documentosPendentes: [] };
          }
        }),
      );
      setPendingTutors(enrichedTutors);
    } catch (error) {
      setPendingTutors([]);
      setPendingTutorsError(error?.message || "Nao foi possivel carregar tutores com documentos pendentes.");
    } finally {
      setLoadingPendingTutors(false);
    }
  }

  async function loadPendingTutorFiles(tutor) {
    if (!tutor?.usuarioId) return;
    setLoadingPendingTutorFiles(true);
    setPendingTutorFilesError("");
    try {
      const data = await api.get(
        "/melpethostel/documentos/usuario/" +
          encodeURIComponent(tutor.usuarioId) +
          "/arquivos",
      );
      const files = Array.isArray(data?.arquivos) ? data.arquivos : [];
      setPendingTutorFiles(files);
      setProcessedDocumentKeys((current) => current.filter((key) => files.some((file) => getDocumentKey(file) === key)));
      if (data?.usuario?.nome) {
        setSelectedPendingTutor((current) => ({
          ...(current || tutor),
          nome: data.usuario.nome,
          usuarioId: data.usuario.id || tutor.usuarioId,
          cadastro: data.usuario.cadastro || current?.cadastro || tutor?.cadastro || null,
        }));
      }
    } catch (error) {
      setPendingTutorFiles([]);
      setPendingTutorFilesError(error?.message || "Nao foi possivel carregar os documentos pendentes.");
    } finally {
      setLoadingPendingTutorFiles(false);
    }
  }

  function clearApprovalSelection() {
    setSelectedPendingTutor(null);
    setPendingTutorFiles([]);
    setPendingTutorFilesError("");
  }

  function clearTutorSelection() {
    setSelectedTutor(null);
    setDocuments([]);
    setUploadFile(null);
  }

  function selectPendingTutor(tutor) {
    const sameTutor = String(selectedPendingTutor?.usuarioId || "") === String(tutor?.usuarioId || "");
    clearTutorSelection();
    if (sameTutor) {
      clearApprovalSelection();
      return;
    }
    setSelectedPendingTutor(tutor);
    setPendingTutorFiles([]);
    loadPendingTutorFiles(tutor);
  }

  async function loadTutorDocuments(tutor) {
    if (!tutor?.usuarioId) {
      setDocuments([]);
      return;
    }
    setLoadingDocuments(true);
    try {
      const data = await api.get(
        "/melpethostel/documentos/usuario/" +
          encodeURIComponent(tutor.usuarioId) +
          "/arquivos?incluirConferidos=1",
      );
      setDocuments(Array.isArray(data?.arquivos) ? data.arquivos : []);
    } catch (error) {
      setDocuments([]);
      showToast(error?.message || "Erro ao carregar documentos do tutor.", "error");
    } finally {
      setLoadingDocuments(false);
    }
  }

  async function searchTutors(event) {
    event?.preventDefault();
    setSubmitted(true);
    setLoading(true);
    clearTutorSelection();
    clearApprovalSelection();
    try {
      const params = new window.URLSearchParams();
      if (searchTerm.trim()) params.set("busca", searchTerm.trim());
      params.set("ordenar", searchOrder);
      const data = await api.get("/melpethostel/clientes?" + params.toString());
      setResults(Array.isArray(data?.clientes) ? data.clientes : []);
    } catch (error) {
      setResults([]);
      showToast(error?.message || "Erro ao pesquisar tutores.", "error");
    } finally {
      setLoading(false);
    }
  }

  function clearSearch() {
    setSearchTerm("");
    setResults([]);
    setSubmitted(false);
    clearTutorSelection();
    clearApprovalSelection();
  }

  function selectTutor(tutor) {
    clearApprovalSelection();
    setSelectedTutor(tutor);
    setUploadFile(null);
    loadTutorDocuments(tutor);
  }

  function openDocumentPreview(file) {
    const url = buildDocumentPreviewUrl(file);
    if (!url) {
      showToast("Nao foi possivel abrir este documento.", "error");
      return;
    }
    setPreviewTitle((file?.nomeDocumento || "Documento") + " - " + (file?.tipoDocumento || "Arquivo"));
    setPreviewSrc(url);
  }

  function getDocumentKey(file) {
    const tipo = String(file?.tipoRegistro || "documento");
    const id = tipo === "contrato" ? file?.contratoId : file?.documentoId;
    if (id) return tipo + "-" + String(id);
    return [
      tipo,
      file?.tipoDocumento,
      file?.nomeDocumento,
      file?.filePath,
      file?.caminhoArquivo,
      file?.url,
    ]
      .filter(Boolean)
      .map(String)
      .join("-");
  }

  function getDocumentTarget(file) {
    const isContrato = file?.tipoRegistro === "contrato";
    const id = isContrato ? Number(file?.contratoId) : Number(file?.documentoId);
    if (!Number.isInteger(id) || id <= 0) return null;
    return { id, isContrato };
  }

  async function approveDocument(file) {
    const target = getDocumentTarget(file);
    if (!target) {
      showToast("Este documento nao pode ser aprovado.", "error");
      return;
    }
    const key = getDocumentKey(file);
    setBusyDocumentKey(key);
    try {
      await api.post(
        target.isContrato
          ? "/melpethostel/contratos/" + target.id + "/conferir"
          : "/melpethostel/documentos/" + target.id + "/conferir",
        {},
      );
      setProcessedDocumentKeys((current) => (current.includes(key) ? current : [...current, key]));
      setPendingTutorFiles((current) => current.map((file) => (getDocumentKey(file) === key ? { ...file, conferido: true, status: "conferido" } : file)));
      showToast(target.isContrato ? "Contrato aprovado." : "Documento aprovado.", "success");
      if (selectedPendingTutor) await loadPendingTutorFiles(selectedPendingTutor);
      if (selectedTutor) await loadTutorDocuments(selectedTutor);
      await loadPendingTutors();
    } catch (error) {
      showToast(error?.message || "Nao foi possivel aprovar o documento.", "error");
    } finally {
      setBusyDocumentKey("");
    }
  }

  function openRejectModal(file) {
    if (!getDocumentTarget(file)) {
      showToast("Este documento nao pode ser reprovado.", "error");
      return;
    }
    setRejectTarget(file);
    setRejectReason("");
  }

  function closeRejectModal() {
    if (busyDocumentKey) return;
    setRejectTarget(null);
    setRejectReason("");
  }

  async function rejectDocument() {
    const target = getDocumentTarget(rejectTarget);
    if (!target) return;
    const motivoReprovacao = rejectReason.trim();
    if (!motivoReprovacao) {
      showToast("Informe o motivo da reprovacao.", "error");
      return;
    }
    const key = getDocumentKey(rejectTarget);
    setBusyDocumentKey(key);
    try {
      await api.post(
        target.isContrato
          ? "/melpethostel/contratos/" + target.id + "/reprovar"
          : "/melpethostel/documentos/" + target.id + "/reprovar",
        { motivoReprovacao },
      );
      setProcessedDocumentKeys((current) => (current.includes(key) ? current : [...current, key]));
      setPendingTutorFiles((current) => current.map((file) => (getDocumentKey(file) === key ? { ...file, conferido: false, status: "reprovado" } : file)));
      showToast(target.isContrato ? "Contrato reprovado." : "Documento reprovado.", "success");
      setRejectTarget(null);
      setRejectReason("");
      if (selectedPendingTutor) await loadPendingTutorFiles(selectedPendingTutor);
      if (selectedTutor) await loadTutorDocuments(selectedTutor);
      await loadPendingTutors();
    } catch (error) {
      showToast(error?.message || "Nao foi possivel reprovar o documento.", "error");
    } finally {
      setBusyDocumentKey("");
    }
  }

  async function uploadDocument() {
    const clienteId = getTutorClienteId(selectedTutor);
    if (!uploadFile) return;
    if (!clienteId) {
      showToast("Cliente invalido para upload.", "error");
      return;
    }
    const formData = new FormData();
    formData.append("clienteId", String(clienteId));
    formData.append("tipoUpload", uploadType);
    formData.append("arquivo", uploadFile);

    setUploading(true);
    try {
      await api.post("/melpethostel/documentos/admin-upload", formData);
      setUploadFile(null);
      showToast("Documento enviado.", "success");
      await loadTutorDocuments(selectedTutor);
    } catch (error) {
      showToast(error?.message || "Erro ao enviar documento.", "error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="admin-page admin-user-create-page">
      <div className="admin-page-panel admin-page-form admin-user-create-card">
        <header className="admin-user-create-header">
          <div className="admin-user-create-heading">
            <span>Mel Pet Hostel</span>
            <h2>Manutenção de Tutor</h2>
          </div>
          <p className="admin-user-create-subtitle">Pesquise um tutor, visualize cadastro, pets e documentos, ou envie arquivos pelo administrador.</p>
        </header>

        <form className="admin-user-create-section admin-user-search-section" onSubmit={searchTutors}>
          <div className="admin-user-section-title"><span>Pesquisa</span><h3>Pesquisar tutor</h3></div>
          <label className="admin-user-search-field">Buscar tutor
            <input type="search" value={searchTerm} onFocus={clearApprovalSelection} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Nome, codigo ou pet" />
          </label>
          <label className="admin-user-search-field">Ordenar por
            <select value={searchOrder} onChange={(event) => setSearchOrder(event.target.value)}>
              <option value="nome_asc">Nome A-Z</option>
              <option value="nome_desc">Nome Z-A</option>
              <option value="codigo_asc">Codigo crescente</option>
              <option value="codigo_desc">Codigo decrescente</option>
            </select>
          </label>
          <div className="admin-page-actions admin-user-search-actions">
            <Button type="submit" disabled={loading}>{loading ? "Pesquisando..." : "Pesquisar"}</Button>
            <Button type="button" variant="outline" onClick={clearSearch} disabled={loading}>Limpar</Button>
          </div>
        </form>

        {submitted ? (
          <section className="admin-user-create-section admin-user-search-results-section">
            <div className="admin-user-section-title"><span>Resultado</span><h3>Tutores encontrados</h3></div>
            <div className="admin-user-search-results">
              {loading ? <p>Carregando tutores...</p> : results.length ? results.map((tutor) => {
                const tutorClienteId = getTutorClienteId(tutor);
                return (
                <article className={getTutorClienteId(selectedTutor) === tutorClienteId ? "is-selected" : ""} key={tutorClienteId || tutor.usuarioId || tutor.nome}>
                  <button type="button" className="admin-user-search-result-pick" onClick={() => selectTutor(tutor)}>
                    <strong>{tutor.nome || "Tutor sem nome"}</strong>
                    <span>{tutor.usuarioLogin ? "Login: " + tutor.usuarioLogin : "Sem login vinculado"}</span>
                  </button>
                </article>
              );
              }) : <p>Nenhum tutor encontrado.</p>}
            </div>
          </section>
        ) : null}

        <section className="admin-user-create-section melpet-tutor-approval-card">
          <div className="admin-user-section-title"><span>Aprovação</span><h3>Aprovar documentos pendentes</h3></div>
          {loadingPendingTutors ? <p>Carregando tutores com pendencias...</p> : pendingTutorsError ? <p className="melpet-error">{pendingTutorsError}</p> : pendingTutors.length ? (
            <div className="admin-user-search-results">
              {pendingTutors.map((tutor) => {
                const pendingFiles = Array.isArray(tutor.documentosPendentes) ? tutor.documentosPendentes : [];
                return (
                <article className={selectedPendingTutor?.usuarioId === tutor.usuarioId ? "is-selected" : ""} key={tutor.usuarioId || tutor.nome}>
                  <button type="button" className="admin-user-search-result-pick" onClick={() => selectPendingTutor(tutor)}>
                    <strong>{tutor.nome || "Tutor sem nome"}</strong>
                    <span>{pendingFiles.length ? pendingFiles.length + " documento(s) pendente(s)" : "Documentos pendentes"}</span>
                    {pendingFiles.length ? (
                      <ul className="melpet-tutor-pending-summary">
                        {pendingFiles.map((file, index) => <li key={getDocumentKey(file) || index}>{file.tipoDocumento || file.nomeDocumento || "Documento"}</li>)}
                      </ul>
                    ) : null}
                  </button>
                </article>
              );
              })}
            </div>
          ) : <p>Nenhum tutor com documentos pendentes no momento.</p>}

          {selectedPendingTutor ? (
            <div className="melpet-tutor-pending-docs">
              <div className="admin-user-section-title"><span>Documentos</span><h3>{selectedPendingTutor.nome || "Tutor selecionado"}</h3></div>
              {selectedPendingTutor?.cadastro ? (
                <dl className="client-profile-readonly-grid">
                  <div><dt>Nome</dt><dd>{selectedPendingTutor.cadastro.nome || selectedPendingTutor.nome || "-"}</dd></div>
                  <div><dt>RG</dt><dd>{selectedPendingTutor.cadastro.rg || "-"}</dd></div>
                  <div><dt>CPF</dt><dd>{selectedPendingTutor.cadastro.cpf ? maskCpf(selectedPendingTutor.cadastro.cpf) : "-"}</dd></div>
                  <div><dt>Endereco</dt><dd>{selectedPendingTutor.cadastro.endereco || "-"}</dd></div>
                </dl>
              ) : null}
              {loadingPendingTutorFiles ? <p>Carregando documentos...</p> : pendingTutorFilesError ? <p className="melpet-error">{pendingTutorFilesError}</p> : pendingTutorFiles.length ? (
                <div className="melpet-tutor-document-list">
                  {pendingTutorFiles.map((file, index) => { const key = getDocumentKey(file) || String(index); const busy = busyDocumentKey === key; const processed = processedDocumentKeys.includes(key) || file.conferido || file.status === "reprovado"; return <article className="melpet-tutor-document-card" key={key}><div><strong>{file.tipoDocumento || "Documento"}</strong><span>{file.nomeDocumento || "Arquivo PDF"}</span><em className={file.conferido ? "is-approved" : file.status === "reprovado" ? "is-rejected" : "is-pending"}>{file.conferido ? "Aprovado" : file.status === "reprovado" ? "Reprovado" : "Pendente"}</em></div><div className="melpet-tutor-document-actions"><Button type="button" variant="outline" size="sm" disabled={!file.existsDisk || busy} onClick={() => openDocumentPreview(file)}>Visualizar</Button><Button type="button" size="sm" disabled={busy || processed} onClick={() => approveDocument(file)}>{busy ? "Processando..." : "Aprovar"}</Button><Button type="button" variant="danger" size="sm" disabled={busy || processed} onClick={() => openRejectModal(file)}>Reprovar</Button></div></article>; })}
                </div>
              ) : <p>Nenhum documento pendente encontrado para este tutor.</p>}
            </div>
          ) : null}
        </section>

        {selectedTutor ? (
          <section className="admin-user-maintenance-selected">
            <div className="admin-user-section-title admin-user-maintenance-selected-title"><span>Tutor selecionado</span><h3>{selectedTutor.nome}</h3></div>
            <section className="admin-user-create-section melpet-tutor-profile-card">
              <div className="admin-user-section-title"><span>Cadastro</span><h3>Login e dados cadastrais</h3></div>
              <p className="melpet-tutor-maintenance-note">Para alterar os dados cadastrais utilize Manutenção do Usuário.</p>
              <dl className="client-profile-readonly-grid">
                <div><dt>Login</dt><dd>{selectedTutor.usuarioLogin || "-"}</dd></div>
                <div><dt>Codigo</dt><dd>{getTutorClienteId(selectedTutor) || "-"}</dd></div>
                <div><dt>Nome</dt><dd>{selectedTutor.nome || "-"}</dd></div>
                <div><dt>CPF</dt><dd>{selectedTutor.cpf ? maskCpf(selectedTutor.cpf) : "-"}</dd></div>
                <div><dt>RG</dt><dd>{selectedTutor.rg || "-"}</dd></div>
                <div><dt>Data de nascimento</dt><dd>{formatBrazilDate(selectedTutor.data_nascimento)}</dd></div>
                <div><dt>Telefone</dt><dd>{selectedTutor.telefone || "-"}</dd></div>
                <div><dt>WhatsApp</dt><dd>{selectedTutor.whatsapp || "-"}</dd></div>
                <div><dt>Email</dt><dd>{selectedTutor.email || "-"}</dd></div>
                <div><dt>Observacoes</dt><dd>{selectedTutor.observacoes || "-"}</dd></div>
              </dl>
              {selectedTutor.enderecos?.length ? <ul className="client-profile-address-list">{selectedTutor.enderecos.map((address, index) => <li key={address.id || index}>{formatAddress(address)}</li>)}</ul> : null}
            </section>

            <section className="admin-user-create-section">
              <div className="admin-user-section-title"><span>Pets</span><h3>Pets cadastrados</h3></div>
              {selectedPets.length ? <div className="melpet-tutor-pet-grid">{selectedPets.map((pet) => <article className="melpet-tutor-pet-card" key={pet.id}><div><strong>{pet.nome || "Pet sem nome"}</strong><span>{pet.raca || "Raca nao informada"}</span></div><em className={pet.ativo ? "is-active" : "is-inactive"}>{pet.ativo ? "Ativo" : "Inativo"}</em></article>)}</div> : <p>Nenhum pet cadastrado.</p>}
            </section>

            <section className="admin-user-create-section">
              <div className="admin-user-section-title"><span>Documentos</span><h3>Documentos do tutor</h3></div>
              {loadingDocuments ? <p>Carregando documentos...</p> : documents.length ? <div className="melpet-tutor-document-list">{documents.map((file, index) => { const key = getDocumentKey(file) || String(index); return <article className="melpet-tutor-document-card" key={key}><div><strong>{file.tipoDocumento || "Documento"}</strong><span>{file.nomeDocumento || "Arquivo PDF"}</span><em className={file.conferido ? "is-approved" : file.status === "reprovado" ? "is-rejected" : "is-pending"}>{file.conferido ? "Aprovado" : file.status === "reprovado" ? "Reprovado" : "Pendente"}</em></div><div className="melpet-tutor-document-actions"><Button type="button" variant="outline" size="sm" disabled={!file.existsDisk} onClick={() => openDocumentPreview(file)}>Visualizar</Button></div></article>; })}</div> : <p>Nenhum documento encontrado.</p>}
            </section>

            <section className="admin-user-create-section melpet-tutor-upload-card">
              <div className="admin-user-section-title"><span>Upload</span><h3>Upload pelo administrador</h3></div>
              <div className="admin-user-create-grid melpet-tutor-upload-grid">
                <label>Tipo
                  <select value={uploadType} onChange={(event) => setUploadType(event.target.value)}>
                    <option value="contrato">Contrato assinado</option>
                    <option value="documento">Documento de identificacao</option>
                    <option value="comprovante">Comprovante de endereco</option>
                    <option value="outros">Outros documentos</option>
                  </select>
                </label>
                <label>Arquivo PDF
                  <input type="file" accept="application/pdf,.pdf" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} />
                </label>
              </div>
              <div className="admin-page-actions admin-user-create-actions melpet-tutor-upload-actions"><Button type="button" onClick={uploadDocument} disabled={uploading || !uploadFile}>{uploading ? "Enviando..." : "Enviar documento"}</Button></div>
            </section>
          </section>
        ) : null}

        <Modal isOpen={Boolean(previewSrc)} onClose={() => setPreviewSrc("")} title={previewTitle || "Visualizar documento"} containerStyle={{ width: "min(96vw, 980px)" }}>
          <div className="melpet-preview-modal-body"><PdfViewer src={previewSrc} title={previewTitle} /></div>
        </Modal>

        <Modal isOpen={Boolean(rejectTarget)} onClose={closeRejectModal} title="Reprovar documento" closeOnBackdropClick={false} showCloseButton={false} containerStyle={{ width: "min(94%, 520px)" }}>
          <div className="melpet-tutor-reject-modal">
            <p>Informe o motivo da reprovacao. Esse texto sera exibido ao cliente para orientar o novo envio.</p>
            <label>Motivo da reprovacao
              <textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} rows={4} disabled={Boolean(busyDocumentKey)} placeholder="Ex.: documento ilegivel, dados divergentes, arquivo incompleto..." />
            </label>
            <div className="modal-actions">
              <Button type="button" variant="outline" onClick={closeRejectModal} disabled={Boolean(busyDocumentKey)}>Cancelar</Button>
              <Button type="button" variant="danger" onClick={rejectDocument} disabled={Boolean(busyDocumentKey)}>{busyDocumentKey ? "Reprovando..." : "Reprovar"}</Button>
            </div>
          </div>
        </Modal>

        <div className="admin-user-create-footer"><Button type="button" variant="outline" onClick={onBack}>Voltar</Button></div>
      </div>
    </main>
  );
}

export default MelPetTutorMaintenancePage;
