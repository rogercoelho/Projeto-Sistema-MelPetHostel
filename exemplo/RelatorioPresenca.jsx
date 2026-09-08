import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import useToast from "../../hooks/useToast";
import MessageToast from "../miscellaneous/MessageToast";
import Buttons from "../miscellaneous/Buttons";
import CustomSelect from "../miscellaneous/CustomSelect";

function rotuloStatus(status) {
  if (status === "Presente") return "P";
  if (status === "Ausente") return "F";
  if (status === "Reposicao") return "R";
  if (status === "Aula Realizada") return "AR";
  if (status === "Dobradinha") return "D";
  return status || "-";
}

function classeBadgeStatus(sigla) {
  if (sigla === "P") return "bg-emerald-600 text-white";
  if (sigla === "F") return "bg-red-600 text-white";
  if (sigla === "R") return "bg-fuchsia-600 text-white";
  if (sigla === "AR") return "bg-sky-600 text-white";
  if (sigla === "D") return "bg-amber-500 text-black";
  return "bg-gray-600 text-white";
}

function formatarDataISOParaBR(dataISO) {
  if (!dataISO) return "-";
  const [ano, mes, dia] = String(dataISO).split("-");
  if (!ano || !mes || !dia) return dataISO;
  return `${dia}/${mes}/${ano}`;
}

function criarDataLocal(dataISO) {
  const [ano, mes, dia] = String(dataISO || "").split("-");
  return new Date(Number(ano), Number(mes) - 1, Number(dia));
}

function nomeMesAno(mes, ano) {
  const nomes = [
    "Janeiro",
    "Fevereiro",
    "Marco",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  return `${nomes[mes - 1]} / ${ano}`;
}

const DIAS_SEMANA_NUMERO = {
  Domingo: 0,
  Segunda: 1,
  Terça: 2,
  Quarta: 3,
  Quinta: 4,
  Sexta: 5,
  Sábado: 6,
};

function RelatorioPresenca() {
  const [alunos, setAlunos] = useState([]);
  const [loadingAlunos, setLoadingAlunos] = useState(false);
  const [loadingRelatorio, setLoadingRelatorio] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [alunoCodigo, setAlunoCodigo] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [relatorio, setRelatorio] = useState(null);
  const [messageToast, showToast] = useToast();
  const [modalDia, setModalDia] = useState(null);
  const [diasAgendados, setDiasAgendados] = useState(new Set());

  const hojeISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const primeiroDiaMesISO = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }, []);

  useEffect(() => {
    setInicio(primeiroDiaMesISO);
    setFim(hojeISO);
  }, [hojeISO, primeiroDiaMesISO]);

  useEffect(() => {
    const carregarAlunos = async () => {
      setLoadingAlunos(true);
      try {
        const response = await api.get("/presenca/alunos-ativos");
        setAlunos(response.data?.alunos || []);
      } catch (error) {
        if (error.response?.status !== 401) {
          showToast({ type: "error", text: "Erro ao carregar alunos." });
        }
      } finally {
        setLoadingAlunos(false);
      }
    };
    carregarAlunos();
  }, [showToast]);

  const buscarRelatorio = async () => {
    if (!alunoCodigo || !inicio || !fim) {
      showToast({
        type: "error",
        text: "Selecione aluno e período (início/fim).",
      });
      return;
    }
    if (inicio > fim) {
      showToast({
        type: "error",
        text: "Período inválido: início maior que fim.",
      });
      return;
    }

    setLoadingRelatorio(true);
    try {
      const response = await api.get(
        `/presenca/relatorio/${alunoCodigo}?inicio=${inicio}&fim=${fim}`,
      );
      setRelatorio(response.data || null);
      showToast({ type: "success", text: "Relatório carregado." });

      // Busca os dias da semana agendados para o aluno
      try {
        const agResp = await api.get(`/agendamentos/aluno/${alunoCodigo}`);
        const agendamentos = agResp.data?.Agendamentos || [];
        const numerosSet = new Set();
        for (const ag of agendamentos) {
          const diaNome = ag.Horario?.Horario_Dia_Semana;
          if (
            diaNome !== undefined &&
            DIAS_SEMANA_NUMERO[diaNome] !== undefined
          ) {
            numerosSet.add(DIAS_SEMANA_NUMERO[diaNome]);
          }
        }
        setDiasAgendados(numerosSet);
      } catch {
        setDiasAgendados(new Set());
      }
    } catch (error) {
      if (error.response?.status !== 401) {
        setRelatorio(null);
        setDiasAgendados(new Set());
        showToast({
          type: "error",
          text:
            error.response?.data?.Erro || "Não foi possível gerar o relatório.",
        });
      }
    } finally {
      setLoadingRelatorio(false);
    }
  };

  const gerarPDF = async () => {
    if (!relatorio) {
      showToast({ type: "error", text: "Gere o relatório primeiro." });
      return;
    }

    setLoadingPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF("l", "mm", "a4");

      const totais = relatorio.totais || {};
      const margem = 10;
      const larguraPagina = 297;
      const areaLargura = larguraPagina - margem * 2;
      const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
      const bgDark = [31, 41, 55];
      const bgCard = [17, 24, 39];
      const textWhite = [255, 255, 255];
      const textGray = [156, 163, 175];
      const borderGray = [55, 65, 81];
      const coresPdf = {
        fundo: bgDark,
        header: [255, 255, 255],
        card: bgCard,
        borda: borderGray,
        texto: textWhite,
        textoSuave: textGray,
      };
      const coresStatus = {
        P: [16, 185, 129],
        F: [220, 38, 38],
        R: [192, 38, 211],
        AR: [2, 132, 199],
        D: [245, 158, 11],
      };

      const baseUrl = import.meta.env.BASE_URL || "/";
      const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
      const logoPath = `${normalizedBaseUrl}logo.png`;

      const carregarLogoDataUrl = async () => {
        const response = await fetch(logoPath);
        if (!response.ok) throw new Error("Logo não encontrado");
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      };

      let logoDataUrl = null;
      try {
        logoDataUrl = await carregarLogoDataUrl();
      } catch {
        logoDataUrl = null;
      }

      const mapaPresencas = {};
      for (const item of relatorio.presencas || []) {
        const chave = String(item.Presenca_Data || "").slice(0, 10);
        if (!chave) continue;
        if (!mapaPresencas[chave]) mapaPresencas[chave] = [];
        mapaPresencas[chave].push(item);
      }

      const dataInicio = criarDataLocal(relatorio?.periodo?.inicio);
      const dataFim = criarDataLocal(relatorio?.periodo?.fim);
      const inicioMes = new Date(
        dataInicio.getFullYear(),
        dataInicio.getMonth(),
        1,
      );
      const fimMes = new Date(dataFim.getFullYear(), dataFim.getMonth(), 1);

      const meses = [];
      const cursor = new Date(inicioMes);
      while (cursor <= fimMes) {
        meses.push({ ano: cursor.getFullYear(), mes: cursor.getMonth() + 1 });
        cursor.setMonth(cursor.getMonth() + 1);
      }
      if (meses.length === 0) {
        showToast({ type: "error", text: "Período inválido para gerar PDF." });
        setLoadingPdf(false);
        return;
      }

      meses.forEach(({ mes, ano }, idx) => {
        if (idx > 0) doc.addPage();

        // Fundo da pagina
        doc.setFillColor(
          coresPdf.fundo[0],
          coresPdf.fundo[1],
          coresPdf.fundo[2],
        );
        doc.rect(0, 0, larguraPagina, 210, "F");

        // Header principal
        doc.setFillColor(
          coresPdf.header[0],
          coresPdf.header[1],
          coresPdf.header[2],
        );
        doc.setDrawColor(
          coresPdf.header[0],
          coresPdf.header[1],
          coresPdf.header[2],
        );
        doc.roundedRect(margem, 8, areaLargura, 26, 2, 2, "FD");

        if (logoDataUrl) {
          try {
            doc.addImage(logoDataUrl, "PNG", margem + 2, 7.5, 24, 24);
          } catch {
            // ignora falha do logo e segue com PDF
          }
        }

        doc.setFontSize(14);
        doc.setTextColor(185, 28, 28);
        doc.text("Relatório de Presença - Calendário", larguraPagina / 2, 22, {
          align: "center",
        });

        // Card de informacoes
        doc.setFillColor(coresPdf.card[0], coresPdf.card[1], coresPdf.card[2]);
        doc.setDrawColor(
          coresPdf.borda[0],
          coresPdf.borda[1],
          coresPdf.borda[2],
        );
        doc.roundedRect(margem, 38, areaLargura, 14, 2, 2, "FD");

        doc.setFontSize(10);
        doc.setTextColor(
          coresPdf.texto[0],
          coresPdf.texto[1],
          coresPdf.texto[2],
        );
        doc.text(
          `Aluno: ${relatorio.aluno?.Alunos_Codigo} - ${relatorio.aluno?.Alunos_Nome}`,
          margem,
          43.5,
        );
        doc.setTextColor(
          coresPdf.textoSuave[0],
          coresPdf.textoSuave[1],
          coresPdf.textoSuave[2],
        );
        doc.text(
          `Período: ${formatarDataISOParaBR(
            relatorio.periodo?.inicio,
          )} até ${formatarDataISOParaBR(relatorio.periodo?.fim)}`,
          margem,
          49,
        );

        // Faixa de totais
        doc.setFillColor(30, 41, 59);
        doc.setDrawColor(
          coresPdf.borda[0],
          coresPdf.borda[1],
          coresPdf.borda[2],
        );
        doc.roundedRect(margem, 55, areaLargura, 10, 2, 2, "FD");
        doc.setFontSize(9);
        doc.setTextColor(226, 232, 240);
        doc.text(
          `P - Presença: ${totais.P || 0} | F - Falta: ${totais.F || 0} | R - Reposição: ${
            totais.R || 0
          } | AR - Aula Realizada: ${totais.AR || 0} | D - Dobradinha: ${
            totais.D || 0
          } | Aulas feitas: ${totais.aulasFeitas || 0}`,
          margem,
          61,
        );

        let y = 72;

        doc.setFontSize(12);
        doc.setTextColor(textWhite[0], textWhite[1], textWhite[2]);
        doc.text(nomeMesAno(mes, ano), margem, y);
        y += 5;

        const primeiroDia = new Date(ano, mes - 1, 1).getDay();
        const totalDias = new Date(ano, mes, 0).getDate();
        const celulas = [];
        for (let i = 0; i < primeiroDia; i += 1) celulas.push(null);
        for (let dia = 1; dia <= totalDias; dia += 1) celulas.push(dia);
        while (celulas.length % 7 !== 0) celulas.push(null);

        const headerH = 7;
        const cellW = areaLargura / 7;
        const cellH = 22;

        doc.setFontSize(9);
        doc.setFillColor(45, 55, 72);
        doc.setDrawColor(90, 90, 90);
        doc.setTextColor(255, 255, 255);
        doc.rect(margem, y, areaLargura, headerH, "F");
        for (let col = 0; col < 7; col += 1) {
          const x = margem + col * cellW;
          doc.rect(x, y, cellW, headerH, "S");
          doc.text(diasSemana[col], x + cellW / 2, y + 4.7, {
            align: "center",
          });
        }
        y += headerH;

        doc.setTextColor(203, 213, 225);
        doc.setFontSize(8);

        celulas.forEach((dia, pos) => {
          const col = pos % 7;
          const row = Math.floor(pos / 7);
          const x = margem + col * cellW;
          const yCell = y + row * cellH;

          doc.setDrawColor(71, 85, 105);
          doc.setFillColor(15, 23, 42);
          doc.rect(x, yCell, cellW, cellH, "FD");

          if (!dia) return;

          const dataISO = `${ano}-${String(mes).padStart(2, "0")}-${String(
            dia,
          ).padStart(2, "0")}`;
          const registro = (mapaPresencas[dataISO] || [])[0];
          const sigla = registro
            ? rotuloStatus(registro.Presenca_Status)
            : null;

          doc.setFontSize(8);
          doc.setTextColor(148, 163, 184);
          doc.text(String(dia), x + 1.5, yCell + 3.5);

          if (sigla) {
            const cor = coresStatus[sigla] || [107, 114, 128];
            doc.setFillColor(cor[0], cor[1], cor[2]);
            doc.roundedRect(x + 1.2, yCell + 5, 10, 4.6, 1, 1, "F");
            doc.setTextColor(255, 255, 255);
            if (sigla === "D") doc.setTextColor(0, 0, 0);
            doc.setFontSize(7);
            doc.text(sigla, x + 6.2, yCell + 8.2, { align: "center" });
          }

          doc.setTextColor(148, 163, 184);
          doc.setFontSize(6.3);
          if (registro?.Presenca_Data_Reposicao_Referencia) {
            doc.text(
              `R1 ${formatarDataISOParaBR(
                registro.Presenca_Data_Reposicao_Referencia,
              )}`,
              x + 1.4,
              yCell + 12,
            );
          }
          if (registro?.Presenca_Data_Reposicao_Referencia_2) {
            doc.text(
              `R2 ${formatarDataISOParaBR(
                registro.Presenca_Data_Reposicao_Referencia_2,
              )}`,
              x + 1.4,
              yCell + 15,
            );
          }
          if (registro?.Presenca_Observacao) {
            const obs = String(registro.Presenca_Observacao).slice(0, 20);
            doc.text(obs, x + 1.4, yCell + 18);
          }
        });
      });

      doc.save(
        `Relatorio_Presenca_${relatorio.aluno?.Alunos_Codigo}_${relatorio.periodo?.inicio}_${relatorio.periodo?.fim}.pdf`,
      );
      showToast({ type: "success", text: "PDF gerado com sucesso." });
    } catch (error) {
      showToast({ type: "error", text: "Erro ao gerar PDF." });
      console.error(error);
    } finally {
      setLoadingPdf(false);
    }
  };

  const presencasPorData = useMemo(() => {
    const mapa = {};
    for (const item of relatorio?.presencas || []) {
      const chave = String(item.Presenca_Data || "").slice(0, 10);
      if (!chave) continue;
      if (!mapa[chave]) mapa[chave] = [];
      mapa[chave].push(item);
    }
    return mapa;
  }, [relatorio?.presencas]);

  const mesesCalendario = useMemo(() => {
    const periodoInicio = relatorio?.periodo?.inicio || inicio;
    const periodoFim = relatorio?.periodo?.fim || fim;
    if (!periodoInicio || !periodoFim) return [];

    const dataInicio = criarDataLocal(periodoInicio);
    const dataFim = criarDataLocal(periodoFim);
    if (Number.isNaN(dataInicio.getTime()) || Number.isNaN(dataFim.getTime())) {
      return [];
    }

    const inicioMes = new Date(
      dataInicio.getFullYear(),
      dataInicio.getMonth(),
      1,
    );
    const fimMes = new Date(dataFim.getFullYear(), dataFim.getMonth(), 1);

    const lista = [];
    const cursor = new Date(inicioMes);
    while (cursor <= fimMes) {
      lista.push({ ano: cursor.getFullYear(), mes: cursor.getMonth() + 1 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return lista;
  }, [relatorio?.periodo?.inicio, relatorio?.periodo?.fim, inicio, fim]);

  return (
    <div className="w-full h-auto">
      {messageToast && <MessageToast messageToast={messageToast} />}

      {/* Modal de descrição do dia */}
      {modalDia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
          onClick={() => setModalDia(null)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">
                  Detalhes do dia
                </p>
                <h3 className="text-lg font-bold text-white">
                  {formatarDataISOParaBR(modalDia.dataISO)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalDia(null)}
                className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-700"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Status:</span>
              {(() => {
                const s = rotuloStatus(modalDia.registro?.Presenca_Status);
                return (
                  <span
                    className={`text-sm font-bold px-3 py-1 rounded-full ${classeBadgeStatus(s)}`}
                  >
                    {modalDia.registro?.Presenca_Status || "-"}
                  </span>
                );
              })()}
            </div>

            {/* Referências de reposição */}
            {modalDia.registro?.Presenca_Data_Reposicao_Referencia && (
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
                  Reposição — Referência 1
                </p>
                <p className="text-white text-sm">
                  {formatarDataISOParaBR(
                    modalDia.registro.Presenca_Data_Reposicao_Referencia,
                  )}
                </p>
              </div>
            )}
            {modalDia.registro?.Presenca_Data_Reposicao_Referencia_2 && (
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
                  Reposição — Referência 2
                </p>
                <p className="text-white text-sm">
                  {formatarDataISOParaBR(
                    modalDia.registro.Presenca_Data_Reposicao_Referencia_2,
                  )}
                </p>
              </div>
            )}

            {/* Descrição / Observação */}
            {modalDia.registro?.Presenca_Observacao && (
              <div className="bg-amber-950/40 border border-amber-700/50 rounded-lg p-3">
                <p className="text-xs text-amber-400 uppercase tracking-wide mb-1">
                  Observação
                </p>
                <p className="text-amber-100 text-sm leading-relaxed whitespace-pre-wrap">
                  {modalDia.registro.Presenca_Observacao}
                </p>
              </div>
            )}

            <div className="pt-1">
              <button
                type="button"
                onClick={() => setModalDia(null)}
                className="w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="bg-gray-800 rounded-xl p-3 sm:p-6 space-y-4 w-full h-full min-h-[80vh] shadow-lg border-2 border-gray-700"
        style={{ minWidth: 0, maxWidth: "100vw" }}
      >
        <div className="relative overflow-hidden rounded-2xl border border-indigo-700/40 bg-gradient-to-r from-slate-900 via-indigo-950/70 to-slate-900 p-4 sm:p-5">
          <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-indigo-500/20 blur-2xl" />
          <div className="absolute -bottom-10 -left-8 h-24 w-24 rounded-full bg-sky-500/20 blur-2xl" />

          <div className="relative z-10 space-y-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl sm:text-2xl font-bold text-white">
                Relatório de Presença
              </h2>
              <p className="text-sm text-slate-300">
                Visualização por calendário com status diário e referências.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="lg:col-span-3 rounded-xl bg-slate-900/60 border border-slate-700 p-3">
                <label className="text-slate-300 text-xs uppercase tracking-wide">
                  Aluno <span className="text-red-400">*</span>
                </label>
                <CustomSelect
                  value={alunoCodigo}
                  onChange={(e) => setAlunoCodigo(e.target.value)}
                  placeholder="Selecione o aluno"
                  disabled={loadingAlunos}
                  className="mt-1.5 bg-slate-800 p-2 border border-slate-600 focus-within:border-sky-500"
                  options={alunos.map((aluno) => ({
                    value: aluno.Alunos_Codigo,
                    label: `${aluno.Alunos_Codigo} - ${aluno.Alunos_Nome}`,
                  }))}
                />
              </div>

              <div className="rounded-xl bg-slate-900/60 border border-slate-700 p-3">
                <label className="text-slate-300 text-xs uppercase tracking-wide">
                  Início <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                  className="mt-1.5 w-full bg-slate-800 text-white rounded-md p-2 border border-slate-600 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="rounded-xl bg-slate-900/60 border border-slate-700 p-3">
                <label className="text-slate-300 text-xs uppercase tracking-wide">
                  Fim <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={fim}
                  onChange={(e) => setFim(e.target.value)}
                  className="mt-1.5 w-full bg-slate-800 text-white rounded-md p-2 border border-slate-600 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="rounded-xl bg-slate-900/60 border border-slate-700 p-3 flex flex-col justify-between">
                <div className="text-xs text-slate-400 uppercase tracking-wide">
                  Período
                </div>
                <div className="text-sm text-slate-200 font-medium mt-1">
                  {inicio ? formatarDataISOParaBR(inicio) : "--"} até{" "}
                  {fim ? formatarDataISOParaBR(fim) : "--"}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <Buttons.BotaoExtrato
                onClick={buscarRelatorio}
                loading={loadingRelatorio}
              >
                Gerar Relatório
              </Buttons.BotaoExtrato>
            </div>
          </div>
        </div>

        {relatorio && (
          <div className="mt-6 space-y-4">
            <div className="text-sm text-gray-300">
              Aluno: {relatorio.aluno?.Alunos_Codigo} -{" "}
              {relatorio.aluno?.Alunos_Nome}
            </div>
            <div className="text-sm text-gray-300">
              Período: {formatarDataISOParaBR(relatorio.periodo?.inicio)} até{" "}
              {formatarDataISOParaBR(relatorio.periodo?.fim)}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <div className="bg-gray-900 border border-gray-600 rounded p-2 text-center">
                <div className="text-xs text-gray-400">P - Presença</div>
                <div className="font-bold text-emerald-300">
                  {relatorio.totais?.P ?? 0}
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-600 rounded p-2 text-center">
                <div className="text-xs text-gray-400">F - Falta</div>
                <div className="font-bold text-red-300">
                  {relatorio.totais?.F ?? 0}
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-600 rounded p-2 text-center">
                <div className="text-xs text-gray-400">R - Reposição</div>
                <div className="font-bold text-fuchsia-300">
                  {relatorio.totais?.R ?? 0}
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-600 rounded p-2 text-center">
                <div className="text-xs text-gray-400">AR - Aula Realizada</div>
                <div className="font-bold text-sky-300">
                  {relatorio.totais?.AR ?? 0}
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-600 rounded p-2 text-center">
                <div className="text-xs text-gray-400">D - Dobradinha</div>
                <div className="font-bold text-amber-300">
                  {relatorio.totais?.D ?? 0}
                </div>
              </div>
              <div className="bg-gray-900 border border-emerald-500 rounded p-2 text-center">
                <div className="text-xs text-gray-400">Aulas feitas</div>
                <div className="font-bold text-emerald-300">
                  {relatorio.totais?.aulasFeitas ?? 0}
                </div>
              </div>
            </div>

            {(relatorio.presencas || []).length > 0 ? (
              <>
                <div className="space-y-4">
                  {mesesCalendario.map(({ mes, ano }) => {
                    const primeiroDia = new Date(ano, mes - 1, 1).getDay();
                    const totalDias = new Date(ano, mes, 0).getDate();
                    const celulas = [];

                    for (let i = 0; i < primeiroDia; i += 1) celulas.push(null);
                    for (let dia = 1; dia <= totalDias; dia += 1)
                      celulas.push(dia);
                    while (celulas.length % 7 !== 0) celulas.push(null);

                    return (
                      <div
                        key={`${ano}-${mes}`}
                        className="bg-gray-900 rounded-xl border border-gray-700 p-3"
                      >
                        <h3 className="text-white font-bold mb-3">
                          {nomeMesAno(mes, ano)}
                        </h3>
                        <div className="overflow-x-auto">
                          <div
                            className="grid grid-cols-7 gap-2 mb-2 text-xs text-gray-400 uppercase"
                            style={{ minWidth: "350px" }}
                          >
                            <div className="text-center">Dom</div>
                            <div className="text-center">Seg</div>
                            <div className="text-center">Ter</div>
                            <div className="text-center">Qua</div>
                            <div className="text-center">Qui</div>
                            <div className="text-center">Sex</div>
                            <div className="text-center">Sab</div>
                          </div>

                          <div
                            className="grid grid-cols-7 gap-2"
                            style={{ minWidth: "350px" }}
                          >
                            {celulas.map((dia, idx) => {
                              if (!dia) {
                                return (
                                  <div
                                    key={`vazio-${ano}-${mes}-${idx}`}
                                    className="min-h-[90px] rounded-lg border border-transparent"
                                  />
                                );
                              }

                              const dataISO = `${ano}-${String(mes).padStart(
                                2,
                                "0",
                              )}-${String(dia).padStart(2, "0")}`;
                              const registros = presencasPorData[dataISO] || [];
                              const registro = registros[0];
                              const sigla = registro
                                ? rotuloStatus(registro.Presenca_Status)
                                : null;

                              const diaSemanaNum = new Date(
                                ano,
                                mes - 1,
                                dia,
                              ).getDay();
                              const ehDiaAgendado =
                                diasAgendados.size > 0 &&
                                diasAgendados.has(diaSemanaNum);
                              const temDescricao =
                                !!registro?.Presenca_Observacao;

                              return (
                                <div
                                  key={dataISO}
                                  className={`min-h-[90px] rounded-lg border p-2 flex flex-col gap-1 ${
                                    ehDiaAgendado
                                      ? "border-indigo-600/60 bg-indigo-950/40"
                                      : "border-gray-700 bg-gray-800"
                                  }`}
                                >
                                  <span
                                    className={`text-xs font-semibold ${
                                      ehDiaAgendado
                                        ? "text-indigo-300"
                                        : "text-gray-400"
                                    }`}
                                  >
                                    {dia}
                                  </span>
                                  {sigla && (
                                    <span
                                      className={`text-xs font-bold px-2 py-0.5 rounded w-fit ${classeBadgeStatus(
                                        sigla,
                                      )}`}
                                    >
                                      {sigla}
                                    </span>
                                  )}
                                  {temDescricao && (
                                    <div className="flex justify-center">
                                      <button
                                        type="button"
                                        title="Ver descrição"
                                        onClick={() =>
                                          setModalDia({
                                            registro,
                                            dataISO,
                                            dia,
                                            mes,
                                            ano,
                                          })
                                        }
                                        className="text-amber-400 hover:text-amber-200 transition-colors"
                                      >
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          className="w-5 h-5"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                          strokeWidth={2}
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M7 8h10M7 12h6m-6 4h10M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                          />
                                        </svg>
                                      </button>
                                    </div>
                                  )}
                                  {registro?.Presenca_Data_Reposicao_Referencia && (
                                    <div className="text-[10px] text-gray-300">
                                      Ref1:{" "}
                                      {formatarDataISOParaBR(
                                        registro.Presenca_Data_Reposicao_Referencia,
                                      )}
                                    </div>
                                  )}
                                  {registro?.Presenca_Data_Reposicao_Referencia_2 && (
                                    <div className="text-[10px] text-gray-300">
                                      Ref2:{" "}
                                      {formatarDataISOParaBR(
                                        registro.Presenca_Data_Reposicao_Referencia_2,
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-center pt-4">
                  <Buttons.BotaoPDF onClick={gerarPDF} loading={loadingPdf} />
                </div>
              </>
            ) : (
              <div className="bg-gray-900 rounded-xl p-4 border border-gray-700 text-center">
                <span className="text-gray-400">
                  Nenhum registro no periodo selecionado.
                </span>
              </div>
            )}
          </div>
        )}

        {!relatorio && (
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-700 text-center">
            <span className="text-gray-400">
              Selecione os filtros e clique em Gerar Relatório.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default RelatorioPresenca;
