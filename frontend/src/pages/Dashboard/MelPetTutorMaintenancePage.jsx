import { useMemo, useState } from "react";
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

function MelPetTutorMaintenancePage({ onBack }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchOrder, setSearchOrder] = useState("nome_asc");
  const [results, setResults] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedTutor, setSelectedTutor] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [uploadType, setUploadType] = useState("contrato");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewSrc, setPreviewSrc] = useState("");
  const { showToast } = useToast();

  const selectedPets = useMemo(() => (Array.isArray(selectedTutor?.pets) ? selectedTutor.pets : []), [selectedTutor]);

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
    setSelectedTutor(null);
    setDocuments([]);
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
    setSelectedTutor(null);
    setDocuments([]);
  }

  function selectTutor(tutor) {
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

  async function uploadDocument() {
    if (!selectedTutor?.id || !uploadFile) return;
    const formData = new FormData();
    formData.append("clienteId", String(selectedTutor.id));
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
            <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Nome, codigo ou pet" />
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
              {loading ? <p>Carregando tutores...</p> : results.length ? results.map((tutor) => (
                <article className={selectedTutor?.id === tutor.id ? "is-selected" : ""} key={tutor.id}>
                  <button type="button" className="admin-user-search-result-pick" onClick={() => selectTutor(tutor)}>
                    <strong>{tutor.nome || "Tutor sem nome"}</strong>
                    <span>{tutor.usuarioLogin ? "Login: " + tutor.usuarioLogin : "Sem login vinculado"}</span>
                  </button>
                </article>
              )) : <p>Nenhum tutor encontrado.</p>}
            </div>
          </section>
        ) : null}

        {selectedTutor ? (
          <section className="admin-user-maintenance-selected">
            <div className="admin-user-section-title admin-user-maintenance-selected-title"><span>Tutor selecionado</span><h3>{selectedTutor.nome}</h3></div>
            <section className="admin-user-create-section melpet-tutor-profile-card">
              <div className="admin-user-section-title"><span>Cadastro</span><h3>Login e dados cadastrais</h3></div>
              <dl className="client-profile-readonly-grid">
                <div><dt>Login</dt><dd>{selectedTutor.usuarioLogin || "-"}</dd></div>
                <div><dt>Codigo</dt><dd>{selectedTutor.id}</dd></div>
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
              <p className="melpet-tutor-maintenance-note">Para alterar os dados cadastrais utilize Manutenção do Usuário.</p>
            </section>

            <section className="admin-user-create-section">
              <div className="admin-user-section-title"><span>Pets</span><h3>Pets cadastrados</h3></div>
              {selectedPets.length ? <div className="melpet-tutor-pet-grid">{selectedPets.map((pet) => <article className="melpet-tutor-pet-card" key={pet.id}><div><strong>{pet.nome || "Pet sem nome"}</strong><span>{pet.raca || "Raca nao informada"}</span></div><em className={pet.ativo ? "is-active" : "is-inactive"}>{pet.ativo ? "Ativo" : "Inativo"}</em></article>)}</div> : <p>Nenhum pet cadastrado.</p>}
            </section>

            <section className="admin-user-create-section">
              <div className="admin-user-section-title"><span>Documentos</span><h3>Documentos do tutor</h3></div>
              {loadingDocuments ? <p>Carregando documentos...</p> : documents.length ? <div className="melpet-tutor-document-list">{documents.map((file, index) => <article className="melpet-tutor-document-card" key={String(file.tipoRegistro || "doc") + String(file.contratoId || file.documentoId || index)}><div><strong>{file.tipoDocumento || "Documento"}</strong><span>{file.nomeDocumento || "Arquivo PDF"}</span></div><Button type="button" variant="outline" size="sm" disabled={!file.existsDisk} onClick={() => openDocumentPreview(file)}>Visualizar</Button></article>)}</div> : <p>Nenhum documento encontrado.</p>}
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

        <div className="admin-user-create-footer"><Button type="button" variant="outline" onClick={onBack}>Voltar</Button></div>
      </div>
    </main>
  );
}

export default MelPetTutorMaintenancePage;
