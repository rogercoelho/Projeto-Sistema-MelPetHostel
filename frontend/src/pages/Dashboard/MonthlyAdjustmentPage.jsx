import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components";
import { useToast } from "../../components/Toast/ToastContext";
import api from "../../services/api";

const EMPTY_FORM = { competencia: "", tipo: "desconto", modo: "valor", valor: "", motivo: "", recorrente: false };
function getCurrentMonth() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7); }
function getAvailableMonths() { const [year, month] = getCurrentMonth().split("-").map(Number); return Array.from({ length: 13 }, (_, index) => { const date = new Date(Date.UTC(year, month - 1 + index, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; }); }
function formatCompetence(value) { const [year, month] = String(value).split("-"); return year && month ? `${month}/${year}` : value; }

export default function MonthlyAdjustmentPage({ onBack }) {
  const { showToast } = useToast();
  const [pets, setPets] = useState([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    api.get("/melpethostel/hospedagens/ajustes-mensais/pets").then((data) => active && setPets(data?.pets || [])).catch((error) => active && showToast(error.message, "error")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [showToast]);
  const pet = useMemo(() => pets.find((item) => `${item.solicitacaoId}:${item.petId}` === selectedKey), [pets, selectedKey]);
  const isMonthly = String(pet?.modoCobranca || "").toLowerCase() === "mensal";
  const periods = isMonthly ? getAvailableMonths() : [pet?.inicioMes || String(pet?.dataEntrada || "").slice(0, 7)].filter(Boolean);
  const amountLabel = form.modo === "percentual" ? "Percentual" : "Valor";
  function updateForm(field, value) { setForm((current) => ({ ...current, [field]: value })); }
  function selectPet(event) { setSelectedKey(event.target.value); setForm(EMPTY_FORM); }
  async function save(event) {
    event.preventDefault();
    const amount = Number(form.valor);
    if (!pet || !form.competencia || !Number.isFinite(amount) || amount <= 0 || !form.motivo.trim()) { showToast("Selecione o ciclo e preencha valor e motivo.", "error"); return; }
    if (form.modo === "percentual" && amount > 100) { showToast("O percentual não pode ser maior que 100%.", "error"); return; }
    setSaving(true);
    try {
      await api.post("/melpethostel/hospedagens/ajustes-mensais", { solicitacaoId: pet.solicitacaoId, petId: pet.petId, ...form, valor: amount });
      showToast("Ajuste registrado e disponível no demonstrativo do ciclo.", "success");
      setForm(EMPTY_FORM);
    } catch (error) { showToast(error.message, "error"); } finally { setSaving(false); }
  }
  return (
    <main className="admin-page"><section className="melpet-section-content melpet-adjustment-page">
      <header className="melpet-adjustment-page__header"><span>Financeiro</span><h2>Registrar desconto ou acréscimo</h2><p>O ajuste aparece detalhado no extrato do tutor antes do pagamento.</p></header>
      <label className="pet-form-field melpet-adjustment-page__pet"><span>Hospedagem e pet</span><select value={selectedKey} onChange={selectPet} disabled={loading}><option value="">{loading ? "Carregando..." : "Selecione o pet"}</option>{pets.map((item) => <option key={`${item.solicitacaoId}:${item.petId}`} value={`${item.solicitacaoId}:${item.petId}`}>{item.clienteNome} — {item.petNome}</option>)}</select></label>
      {pet && <form className="melpet-adjustment-form" onSubmit={save}>
        <div className="melpet-adjustment-page__context"><div><span>Serviço</span><strong>{pet.tipo || "Hospedagem"}</strong></div><div><span>Cobrança</span><strong>{isMonthly ? "Mensal" : "Pontual"}</strong></div></div>
        <fieldset><legend>Dados do ajuste</legend><div className="melpet-adjustment-form__grid">
          <label className="pet-form-field"><span>{isMonthly ? "Ciclo de cobrança" : "Período do pedido"}</span><select value={form.competencia} onChange={(event) => updateForm("competencia", event.target.value)} required><option value="">Selecione</option>{periods.map((period) => <option key={period} value={period}>{formatCompetence(period)}</option>)}</select></label>
          <label className="pet-form-field"><span>Operação</span><select value={form.tipo} onChange={(event) => updateForm("tipo", event.target.value)}><option value="desconto">Desconto</option><option value="acrescimo">Acréscimo</option></select></label>
          <label className="pet-form-field"><span>Como calcular</span><select value={form.modo} onChange={(event) => updateForm("modo", event.target.value)}><option value="valor">Valor fixo (R$)</option><option value="percentual">Percentual (%)</option></select></label>
          <label className="pet-form-field"><span>{amountLabel}</span><input type="number" inputMode="decimal" min="0.01" max={form.modo === "percentual" ? "100" : undefined} step="0.01" value={form.valor} onChange={(event) => updateForm("valor", event.target.value)} required /></label>
          <label className="pet-form-field melpet-adjustment-form__reason"><span>Motivo que o tutor verá</span><textarea rows="3" value={form.motivo} onChange={(event) => updateForm("motivo", event.target.value)} maxLength="500" required /></label>
        </div>{isMonthly && <label className="melpet-adjustment-form__recurrence"><input type="checkbox" checked={form.recorrente} onChange={(event) => updateForm("recorrente", event.target.checked)} /><span><strong>Repetir nos próximos ciclos</strong><small>O mesmo ajuste será aplicado até ser substituído por outro.</small></span></label>}</fieldset>
        <div className="admin-page-actions"><Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Registrar ajuste"}</Button></div>
      </form>}
      <div className="pet-main-actions melpet-back-actions"><Button type="button" variant="outline" onClick={onBack} className="melpet-back-button">Voltar</Button></div>
    </section></main>
  );
}