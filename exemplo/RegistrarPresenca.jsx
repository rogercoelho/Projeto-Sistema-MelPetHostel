import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../services/api";
import useToast from "../../hooks/useToast";
import MessageToast from "../miscellaneous/MessageToast";

const STATUS_ORDEM = [
  "Presente",
  "Ausente",
  "Reposicao",
  "Aula Realizada",
  "Dobradinha",
  "",
];
const MESES_FUTUROS_PERMITIDOS = 3;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDateKey(ano, mesIndex, dia) {
  return `${ano}-${pad2(mesIndex + 1)}-${pad2(dia)}`;
}

function legendaStatus(status) {
  if (status === "Presente") return "P";
  if (status === "Ausente") return "F";
  if (status === "Reposicao") return "R";
  if (status === "Aula Realizada") return "AR";
  if (status === "Dobradinha") return "D";
  return "";
}

function statusClass(status) {
  if (status === "Presente") {
    return "bg-green-600 border-green-300 text-white";
  }
  if (status === "Ausente") {
    return "bg-red-700 border-red-300 text-white";
  }
  if (status === "Reposicao") {
    return "bg-amber-500 border-amber-200 text-black";
  }
  if (status === "Aula Realizada") {
    return "bg-cyan-600 border-cyan-300 text-white";
  }
  if (status === "Dobradinha") {
    return "bg-fuchsia-600 border-fuchsia-300 text-white";
  }
  return "bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700";
}

function RegistrarPresenca() {
  const hoje = useMemo(() => new Date(), []);
  const anoAtual = hoje.getFullYear();
  const mesAtualIndex = hoje.getMonth();
  const [anoSelecionado, setAnoSelecionado] = useState(anoAtual);
  const [mesSelecionadoIndex, setMesSelecionadoIndex] = useState(mesAtualIndex);

  const [loadingGrade, setLoadingGrade] = useState(false);
  const [filtrando, setFiltrando] = useState(false);
  const [savingGrade, setSavingGrade] = useState(false);
  const [gradeAlunos, setGradeAlunos] = useState([]);
  const [gradeMap, setGradeMap] = useState({});
  const [celulasPendentes, setCelulasPendentes] = useState(new Set());
  const tabelaRef = useRef(null);
  const [filtroGrade, setFiltroGrade] = useState("");
  const [filtroHorario, setFiltroHorario] = useState("");
  const [horarios, setHorarios] = useState([]);
  const [alunosPorHorario, setAlunosPorHorario] = useState(null);
  const [ordenacaoGrade, setOrdenacaoGrade] = useState({
    campo: "nome",
    direcao: "asc",
  });
  const [reposicaoGradeModal, setReposicaoGradeModal] = useState({
    open: false,
    alunoCodigo: "",
    data: "",
    tipo: "Reposicao",
    valor: "",
    valor2: "",
  });
  const [observacaoGradeModal, setObservacaoGradeModal] = useState({
    open: false,
    alunoCodigo: "",
    data: "",
    texto: "",
  });
  const [erroGradeMobileModal, setErroGradeMobileModal] = useState({
    open: false,
    alunoCodigo: "",
    data: "",
    mensagem: "",
  });
  const [messageToast, showToast] = useToast();

  const totalDiasMes = useMemo(
    () => new Date(anoSelecionado, mesSelecionadoIndex + 1, 0).getDate(),
    [anoSelecionado, mesSelecionadoIndex],
  );
  const nomesMeses = [
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
  const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

  const gerarPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const nomeMes = nomesMeses[mesSelecionadoIndex];
    const filename = `Grade-${nomeMes}-${anoSelecionado}.pdf`;

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });
    const pageW = 297;
    const pageH = 210;
    const marginX = 8;
    const marginY = 16;
    const usableW = pageW - marginX * 2;
    const colCodigo = 12;
    const colNome = 38;
    const colDia = (usableW - colCodigo - colNome) / totalDiasMes;
    const headerH = 9;
    const obsFs = 3.8;
    const obsLineH = 1.9; // altura por linha de obs em mm

    // Formata data de referência: sempre dd/mm/aa
    const fmtRef = (ref) => {
      if (!ref) return "";
      const [ry, rm, rd] = ref.split("-").map(Number);
      return `${pad2(rd)}/${pad2(rm)}/${String(ry).slice(2)}`;
    };

    const statusColors = {
      Presente: [22, 163, 74],
      Ausente: [185, 28, 28],
      Reposicao: [217, 119, 6],
      "Aula Realizada": [8, 145, 178],
      Dobradinha: [192, 38, 211],
    };
    const statusTextEscuro = new Set(["Reposicao"]);

    const drawCell = (cx, cy, w, h, fillRGB, textRGB, text, fs = 7) => {
      doc.setFillColor(...fillRGB);
      doc.setDrawColor(160, 160, 160);
      doc.rect(cx, cy, w, h, "FD");
      if (text) {
        doc.setFontSize(fs);
        doc.setTextColor(...textRGB);
        doc.text(String(text), cx + w / 2, cy + h / 2 + fs * 0.19, {
          align: "center",
        });
      }
    };

    // Título
    doc.setFontSize(11);
    doc.setTextColor(10, 10, 10);
    doc.text(
      `Grade de Presenças — ${nomeMes} ${anoSelecionado}`,
      pageW / 2,
      8,
      { align: "center" },
    );
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(`${gradeAlunosFiltrados.length} aluno(s)`, pageW / 2, 13, {
      align: "center",
    });

    // Cabeçalho
    const headerBg = [30, 58, 95];
    const headerFg = [255, 255, 255];
    let x = marginX;
    let y = marginY;

    drawCell(x, y, colCodigo, headerH, headerBg, headerFg, "Cód.");
    x += colCodigo;
    drawCell(x, y, colNome, headerH, headerBg, headerFg, "Nome");
    x += colNome;

    for (let dia = 1; dia <= totalDiasMes; dia++) {
      const ds =
        diasSemana[new Date(anoSelecionado, mesSelecionadoIndex, dia).getDay()];
      doc.setFillColor(...headerBg);
      doc.setDrawColor(160, 160, 160);
      doc.rect(x, y, colDia, headerH, "FD");
      doc.setFontSize(6.5);
      doc.setTextColor(...headerFg);
      doc.text(String(dia), x + colDia / 2, y + headerH / 2 - 0.5, {
        align: "center",
      });
      doc.setFontSize(5.5);
      doc.text(ds, x + colDia / 2, y + headerH / 2 + 3, {
        align: "center",
      });
      x += colDia;
    }
    y += headerH;

    // Linhas de dados
    gradeAlunosFiltrados.forEach((aluno, idx) => {
      const alunoKey = String(aluno.Alunos_Codigo);
      const mapaDias = gradeMap[alunoKey] || {};

      // Pré-calcula altura da linha com base na observação mais longa da linha
      let maxObsLines = 0;
      let anyRef = false;
      for (let dia = 1; dia <= totalDiasMes; dia++) {
        const chave = toDateKey(anoSelecionado, mesSelecionadoIndex, dia);
        const valor = mapaDias[chave] || {};
        if (String(valor.dataReposicaoReferencia || "").trim()) anyRef = true;
        const obs = String(valor.observacao || "").trim();
        if (obs) {
          doc.setFontSize(obsFs);
          const linhas = doc.splitTextToSize(obs, colDia - 0.6);
          maxObsLines = Math.max(maxObsLines, linhas.length);
        }
      }
      // altura = bloco status (4.5) + bloco ref se houver (3) + bloco obs
      const rowH =
        4.5 +
        (anyRef ? 3 : 0) +
        (maxObsLines > 0 ? maxObsLines * obsLineH + 1 : 0) +
        1.5;

      if (y + rowH > pageH - 15) {
        doc.addPage();
        y = marginY;
      }

      const rowBg = idx % 2 === 0 ? [248, 250, 252] : [235, 240, 248];
      x = marginX;

      drawCell(x, y, colCodigo, rowH, rowBg, [10, 10, 10], alunoKey, 6.5);
      x += colCodigo;

      // Nome alinhado à esquerda
      doc.setFillColor(...rowBg);
      doc.setDrawColor(160, 160, 160);
      doc.rect(x, y, colNome, rowH, "FD");
      doc.setFontSize(6.5);
      doc.setTextColor(10, 10, 10);
      doc.text(
        String(aluno.Alunos_Nome || "").substring(0, 22),
        x + 1,
        y + rowH / 2 + 6.5 * 0.19,
      );
      x += colNome;

      for (let dia = 1; dia <= totalDiasMes; dia++) {
        const chave = toDateKey(anoSelecionado, mesSelecionadoIndex, dia);
        const valor = mapaDias[chave] || {};
        const st = valor.status || "";
        const legenda = legendaStatus(st);
        const bg = statusColors[st] || rowBg;
        const fg = statusColors[st]
          ? statusTextEscuro.has(st)
            ? [0, 0, 0]
            : [255, 255, 255]
          : [180, 180, 180];

        // Fundo + borda
        doc.setFillColor(...bg);
        doc.setDrawColor(160, 160, 160);
        doc.rect(x, y, colDia, rowH, "FD");

        let curY = y + 3.2;

        // Legenda principal (P/F/R/D/AR)
        if (legenda) {
          doc.setFontSize(6.5);
          doc.setTextColor(...fg);
          doc.text(legenda, x + colDia / 2, curY, { align: "center" });
        }
        curY += 3;

        // Datas de referência (R e D)
        const ref1 = String(valor.dataReposicaoReferencia || "").trim();
        const ref2 = String(valor.dataReposicaoReferencia2 || "").trim();
        if (ref1) {
          const t1 = ref1 === chave ? "hoje" : fmtRef(ref1);
          const t2 = ref2 ? (ref2 === chave ? "hoje" : fmtRef(ref2)) : "";
          doc.setFontSize(4);
          doc.setTextColor(...fg);
          doc.text(t1, x + colDia / 2, curY, { align: "center" });
          if (t2) {
            curY += obsLineH;
            doc.text(t2, x + colDia / 2, curY, { align: "center" });
          }
        }
        if (anyRef) curY = y + 4.5 + 3; // alinha obs à mesma altura em todas as células

        // Observação completa (com quebra de linha)
        const obs = String(valor.observacao || "").trim();
        if (obs) {
          doc.setFontSize(obsFs);
          doc.setTextColor(...fg);
          const linhas = doc.splitTextToSize(obs, colDia - 0.6);
          linhas.forEach((linha, li) => {
            doc.text(linha, x + colDia / 2, curY + 1 + li * obsLineH, {
              align: "center",
            });
          });
        }

        x += colDia;
      }
      y += rowH;
    });

    // Legenda no rodapé
    const legendaItems = [
      { label: "P=Presente", bg: [22, 163, 74], fg: [255, 255, 255] },
      { label: "F=Falta", bg: [185, 28, 28], fg: [255, 255, 255] },
      { label: "R=Reposição", bg: [217, 119, 6], fg: [0, 0, 0] },
      { label: "AR=Aula Realizada", bg: [8, 145, 178], fg: [255, 255, 255] },
      { label: "D=Dobradinha", bg: [192, 38, 211], fg: [255, 255, 255] },
    ];
    let lx = marginX;
    const ly = pageH - 8;
    legendaItems.forEach((l) => {
      const lw = 30;
      const lh = 5;
      doc.setFillColor(...l.bg);
      doc.setDrawColor(...l.bg);
      doc.rect(lx, ly, lw, lh, "F");
      doc.setFontSize(6);
      doc.setTextColor(...l.fg);
      doc.text(l.label, lx + lw / 2, ly + lh / 2 + 1, { align: "center" });
      lx += lw + 2;
    });

    doc.save(filename);
  };

  const competenciaAtual = anoAtual * 12 + mesAtualIndex;
  const competenciaSelecionada = anoSelecionado * 12 + mesSelecionadoIndex;
  const competenciaLimite = competenciaAtual + MESES_FUTUROS_PERMITIDOS;
  const podeAvancarCompetencia = competenciaSelecionada < competenciaLimite;

  const irParaMesAnterior = () => {
    if (mesSelecionadoIndex === 0) {
      setMesSelecionadoIndex(11);
      setAnoSelecionado((prev) => prev - 1);
      return;
    }
    setMesSelecionadoIndex((prev) => prev - 1);
  };

  const irParaMesSeguinte = () => {
    if (!podeAvancarCompetencia) return;
    if (mesSelecionadoIndex === 11) {
      setMesSelecionadoIndex(0);
      setAnoSelecionado((prev) => prev + 1);
      return;
    }
    setMesSelecionadoIndex((prev) => prev + 1);
  };

  const nomeDiaSemana = (dia) => {
    const idx = new Date(anoSelecionado, mesSelecionadoIndex, dia).getDay();
    return diasSemana[idx].toLowerCase();
  };

  const gradeAlunosFiltrados = useMemo(() => {
    const termo = String(filtroGrade || "")
      .trim()
      .toLowerCase();
    let base = termo
      ? gradeAlunos.filter((aluno) => {
          const nome = String(aluno.Alunos_Nome || "").toLowerCase();
          const codigo = String(aluno.Alunos_Codigo || "");
          return nome.includes(termo) || codigo.includes(termo);
        })
      : [...gradeAlunos];

    if (alunosPorHorario !== null) {
      base = base.filter((aluno) =>
        alunosPorHorario.includes(String(aluno.Alunos_Codigo)),
      );
    }

    base.sort((a, b) => {
      if (ordenacaoGrade.campo === "codigo") {
        const diff = Number(a.Alunos_Codigo) - Number(b.Alunos_Codigo);
        return ordenacaoGrade.direcao === "asc" ? diff : -diff;
      }
      const comp = String(a.Alunos_Nome || "").localeCompare(
        String(b.Alunos_Nome || ""),
        "pt-BR",
      );
      return ordenacaoGrade.direcao === "asc" ? comp : -comp;
    });

    return base;
  }, [
    gradeAlunos,
    filtroGrade,
    alunosPorHorario,
    ordenacaoGrade,
  ]);

  const alternarOrdenacaoGrade = (campo) => {
    setOrdenacaoGrade((prev) => {
      if (prev.campo === campo) {
        return {
          campo,
          direcao: prev.direcao === "asc" ? "desc" : "asc",
        };
      }
      return { campo, direcao: "asc" };
    });
  };

  const marcadorOrdenacao = (campo) => {
    if (ordenacaoGrade.campo !== campo) return "↕";
    return ordenacaoGrade.direcao === "asc" ? "↑" : "↓";
  };

  const errosGrade = useMemo(() => {
    const mapaErros = {};
    let total = 0;

    for (const [alunoKey, mapaDias] of Object.entries(gradeMap || {})) {
      for (const [data, valor] of Object.entries(mapaDias || {})) {
        if (valor?.status !== "Reposicao" && valor?.status !== "Dobradinha")
          continue;

        const referencias = [];
        const ref1 = String(valor?.dataReposicaoReferencia || "").trim();
        const ref2 = String(valor?.dataReposicaoReferencia2 || "").trim();
        referencias.push(ref1);
        if (valor?.status === "Dobradinha") referencias.push(ref2);

        if (
          !ref1 ||
          (valor?.status === "Dobradinha" && (!ref2 || ref2 === ref1))
        ) {
          if (!mapaErros[alunoKey]) mapaErros[alunoKey] = {};
          mapaErros[alunoKey][data] =
            valor?.status === "Dobradinha"
              ? "Dobradinha exige duas datas de falta válidas e diferentes."
              : "Reposição sem data de falta. Clique em R para preencher.";
          total += 1;
          continue;
        }

        let erroEncontrado = "";
        for (const referencia of referencias) {
          // Referência igual à própria data do D = aula regular, não precisa ser F
          if (referencia === data) continue;
          const statusRef = mapaDias?.[referencia]?.status;
          if (!statusRef) {
            // Referência de outro mês não está no gradeMap — o backend valida no banco
            const refAno = parseInt(referencia.slice(0, 4), 10);
            const refMes = parseInt(referencia.slice(5, 7), 10) - 1; // 0-based
            if (refAno === anoSelecionado && refMes === mesSelecionadoIndex) {
              erroEncontrado =
                "A data informada para reposição não está marcada no calendário como Falta.";
            }
            break;
          }
          if (statusRef === "Aula Realizada") {
            erroEncontrado =
              "Não é possível repor um dia marcado como aula realizada.";
            break;
          }
          if (statusRef && statusRef !== "Ausente") {
            erroEncontrado = "Não é possível repor aula com presença marcada!";
            break;
          }
        }

        if (erroEncontrado) {
          if (!mapaErros[alunoKey]) mapaErros[alunoKey] = {};
          mapaErros[alunoKey][data] = erroEncontrado;
          total += 1;
        }
      }
    }

    return { mapaErros, total };
  }, [gradeMap, anoSelecionado, mesSelecionadoIndex]);

  // Carrega lista de horários para o select de filtro
  useEffect(() => {
    api
      .get("/horarios")
      .then((res) => setHorarios(res.data?.Horarios || []))
      .catch(() => {});
  }, []);

  // Ao trocar o horário selecionado, busca os alunos agendados nele
  useEffect(() => {
    if (!filtroHorario) {
      setAlunosPorHorario(null);
      setFiltrando(false);
      return;
    }
    setFiltrando(true);
    api
      .get(`/agendamentos/horario/${filtroHorario}`)
      .then((res) => {
        const codigos = (res.data?.Agendamentos || []).map((a) =>
          String(a.Aluno?.Alunos_Codigo ?? a.Aluno_Codigo),
        );
        setAlunosPorHorario(codigos);
      })
      .catch(() => setAlunosPorHorario([]))
      .finally(() => setFiltrando(false));
  }, [filtroHorario]);

  useEffect(() => {
    const carregarGradeMensal = async () => {
      setLoadingGrade(true);
      try {
        const response = await api.get(
          `/presenca/grade/${anoSelecionado}/${mesSelecionadoIndex + 1}`,
        );
        const alunosGrade = response.data?.alunos || [];
        const presencasPorAluno = response.data?.presencasPorAluno || {};
        const mapa = {};

        for (const aluno of alunosGrade) {
          const cod = String(aluno.Alunos_Codigo);
          mapa[cod] = {};
          const lista = presencasPorAluno[cod] || [];
          for (const item of lista) {
            mapa[cod][item.Presenca_Data] = {
              status: item.Presenca_Status,
              dataReposicaoReferencia:
                item.Presenca_Data_Reposicao_Referencia || "",
              dataReposicaoReferencia2:
                item.Presenca_Data_Reposicao_Referencia_2 || "",
              observacao: item.Presenca_Observacao || "",
            };
          }
        }

        setGradeAlunos(alunosGrade);
        setGradeMap(mapa);
      } catch (error) {
        if (error.response?.status !== 401) {
          showToast({
            type: "error",
            text: "Erro ao carregar grade mensal de presença.",
          });
        }
      } finally {
        setLoadingGrade(false);
      }
    };

    carregarGradeMensal();
  }, [anoSelecionado, mesSelecionadoIndex, showToast]);

  const proximoStatus = (statusAtual) => {
    const indiceAtual = STATUS_ORDEM.indexOf(statusAtual);
    return indiceAtual === -1
      ? STATUS_ORDEM[0]
      : STATUS_ORDEM[(indiceAtual + 1) % STATUS_ORDEM.length];
  };

  const alternarStatusGrade = (alunoCodigoGrade, dia) => {
    const alunoKey = String(alunoCodigoGrade);
    const chaveData = toDateKey(anoSelecionado, mesSelecionadoIndex, dia);
    const statusAtual = gradeMap[alunoKey]?.[chaveData]?.status;
    const novoStatus = proximoStatus(statusAtual);

    setGradeMap((prev) => {
      const mapaAluno = { ...(prev[alunoKey] || {}) };
      const celulaAtual = mapaAluno[chaveData] || {};

      if (!novoStatus) {
        delete mapaAluno[chaveData];
      } else {
        mapaAluno[chaveData] = {
          status: novoStatus,
          dataReposicaoReferencia:
            novoStatus === "Reposicao" || novoStatus === "Dobradinha"
              ? celulaAtual.dataReposicaoReferencia || ""
              : "",
          dataReposicaoReferencia2:
            novoStatus === "Dobradinha"
              ? celulaAtual.dataReposicaoReferencia2 || ""
              : "",
          observacao: celulaAtual.observacao || "",
        };
      }

      return {
        ...prev,
        [alunoKey]: mapaAluno,
      };
    });
    setCelulasPendentes((prev) =>
      new Set(prev).add(`${alunoKey}|${chaveData}`),
    );
  };

  const abrirModalObservacaoGrade = (alunoCodigoGrade, data) => {
    const alunoKey = String(alunoCodigoGrade);
    setObservacaoGradeModal({
      open: true,
      alunoCodigo: alunoKey,
      data,
      texto: gradeMap[alunoKey]?.[data]?.observacao || "",
    });
  };

  const salvarObservacaoGrade = () => {
    const alunoKey = String(observacaoGradeModal.alunoCodigo);
    const data = observacaoGradeModal.data;
    if (!alunoKey || !data || !gradeMap[alunoKey]?.[data]?.status) {
      setObservacaoGradeModal({
        open: false,
        alunoCodigo: "",
        data: "",
        texto: "",
      });
      return;
    }

    setGradeMap((prev) => ({
      ...prev,
      [alunoKey]: {
        ...(prev[alunoKey] || {}),
        [data]: {
          ...(prev[alunoKey]?.[data] || {}),
          observacao: observacaoGradeModal.texto,
        },
      },
    }));
    setCelulasPendentes((prev) => new Set(prev).add(`${alunoKey}|${data}`));

    setObservacaoGradeModal({
      open: false,
      alunoCodigo: "",
      data: "",
      texto: "",
    });
  };

  const abrirModalReposicaoGrade = (alunoCodigoGrade, data) => {
    const alunoKey = String(alunoCodigoGrade);
    const tipo = gradeMap[alunoKey]?.[data]?.status || "Reposicao";
    setReposicaoGradeModal({
      open: true,
      alunoCodigo: alunoKey,
      data,
      tipo,
      valor: gradeMap[alunoKey]?.[data]?.dataReposicaoReferencia || "",
      valor2: gradeMap[alunoKey]?.[data]?.dataReposicaoReferencia2 || "",
    });
  };

  const nomeAlunoPorCodigoGrade = (alunoCodigoGrade) => {
    const aluno = gradeAlunos.find(
      (a) => String(a.Alunos_Codigo) === String(alunoCodigoGrade),
    );
    return aluno?.Alunos_Nome || "Aluno";
  };

  const salvarMatrizPresencas = async () => {
    const registros = Object.entries(gradeMap).map(
      ([alunoCodigoGrade, mapaDias]) => {
        const presencas = Object.entries(mapaDias || {})
          .filter(([, valor]) => !!valor?.status)
          .map(([data, valor]) => ({
            data,
            status: valor.status,
            dataReposicaoReferencia:
              valor.status === "Reposicao" || valor.status === "Dobradinha"
                ? valor.dataReposicaoReferencia || null
                : null,
            dataReposicaoReferencia2:
              valor.status === "Dobradinha"
                ? valor.dataReposicaoReferencia2 || null
                : null,
            observacao: String(valor.observacao || "").trim() || null,
          }));
        return { Aluno_Codigo: Number(alunoCodigoGrade), presencas };
      },
    );

    if (registros.length === 0) {
      showToast({
        type: "error",
        text: "Não há alunos carregados na grade para salvar.",
      });
      return;
    }

    if (errosGrade.total > 0) {
      showToast({
        type: "error",
        text: "Existem erros na grade. Passe o mouse nas celulas destacadas para ver o motivo.",
      });
      return;
    }

    setSavingGrade(true);
    try {
      await api.post("/presenca/salvar-matriz", {
        ano: anoSelecionado,
        mes: mesSelecionadoIndex + 1,
        registros,
      });
      showToast({ type: "success", text: "Grade salva com sucesso." });
      setCelulasPendentes(new Set());
    } catch (error) {
      if (error.response?.status !== 401) {
        showToast({
          type: "error",
          text:
            error.response?.data?.Erro ||
            "Não foi possível salvar a grade de presença.",
        });
      }
    } finally {
      setSavingGrade(false);
    }
  };

  return (
    <div className="w-full h-auto">
      {messageToast && <MessageToast messageToast={messageToast} />}

      <div className="bg-gray-800 rounded-xl p-3 md:p-6 space-y-3 md:space-y-4">
        <h2 className="text-lg md:text-xl font-bold text-white">
          Registrar Presença
        </h2>

        <div className="border border-gray-700 rounded-lg p-2 md:p-3 bg-gray-900">
          <div className="flex flex-col gap-2 mb-3 w-fit">
            <h4 className="font-semibold text-sm md:text-base text-center">
              Mês de Referência
            </h4>
            <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
              <button
                type="button"
                onClick={irParaMesAnterior}
                className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white"
                title="Mês anterior"
              >
                {"<"}
              </button>
              <span className="min-w-[130px] text-center">
                {nomesMeses[mesSelecionadoIndex]} / {anoSelecionado}
              </span>
              <button
                type="button"
                onClick={irParaMesSeguinte}
                disabled={!podeAvancarCompetencia}
                className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                title="Mês seguinte"
              >
                {">"}
              </button>
            </div>
          </div>
          <div className="mb-2 md:mb-3 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-2 items-center">
            <label className="text-sm text-gray-300">
              Filtrar alunos (código ou nome):
            </label>
            <input
              type="text"
              value={filtroGrade}
              onChange={(e) => {
                setFiltrando(true);
                setFiltroGrade(e.target.value);
                setTimeout(() => setFiltrando(false), 50);
              }}
              className="border border-gray-300 rounded-md p-2 bg-white text-black"
              placeholder="Ex.: 12 ou Maria"
            />
          </div>
          <div className="mb-2 md:mb-3 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-2 items-center">
            <label className="text-sm text-gray-300">
              Filtrar alunos por horário:
            </label>
            <select
              value={filtroHorario}
              onChange={(e) => {
                setFiltroHorario(e.target.value);
              }}
              className="border border-gray-300 rounded-md p-2 bg-white text-black"
            >
              <option value="">Todos os horários</option>
              {horarios.map((h) => (
                <option key={h.Horario_Id} value={h.Horario_Id}>
                  {h.Horario_Dia_Semana} &mdash;{" "}
                  {String(h.Horario_Inicio).substring(0, 5)} às{" "}
                  {String(h.Horario_Fim).substring(0, 5)}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] sm:text-xs">
            <span className="px-3 py-1 rounded-md bg-green-600 text-white font-semibold">
              P = Presente
            </span>
            <span className="px-3 py-1 rounded-md bg-red-600 text-white font-semibold">
              F = Falta
            </span>
            <span className="px-3 py-1 rounded-md bg-amber-500 text-black font-semibold">
              R = Reposição
            </span>
            <span className="px-3 py-1 rounded-md bg-cyan-600 text-white font-semibold">
              AR = Aula realizada
            </span>
            <span className="px-3 py-1 rounded-md bg-fuchsia-600 text-white font-semibold">
              D = Dobradinha
            </span>
          </div>
          <div className="flex flex-col gap-1 mb-2">
            <button
              type="button"
              onClick={gerarPDF}
              className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-700 hover:bg-red-600 text-white text-xs font-semibold transition-colors"
            >
              📄 Salvar como PDF
            </button>
            <p className="md:hidden text-[11px] text-gray-400">
              Deslize horizontalmente para ver todos os dias da grade.
            </p>
          </div>
          <div className="relative overflow-auto max-h-[72vh] pb-1">
            {(loadingGrade || filtrando) && (
              <div className="absolute inset-0 z-40 flex items-center justify-center bg-gray-900/70 rounded-lg">
                <span className="text-white font-semibold text-sm px-5 py-3 bg-gray-800 border border-gray-600 rounded-xl shadow-lg">
                  Carregando grade...
                </span>
              </div>
            )}
            <table
              ref={tabelaRef}
              className="min-w-[1200px] border-collapse text-xs md:text-sm"
            >
              <thead>
                <tr>
                  {/* Código — sticky top-left corner */}
                  <th className="sticky top-0 left-0 z-30 border border-gray-600 px-1 py-1 text-left bg-gray-800 w-28 md:min-w-20">
                    <button
                      type="button"
                      onClick={() => alternarOrdenacaoGrade("codigo")}
                      className="w-full text-left hover:text-yellow-300 text-[10px] md:text-xs leading-tight"
                    >
                      Cód {marcadorOrdenacao("codigo")}
                    </button>
                    {/* On mobile show student count here since Name col is hidden */}
                    <div className="md:hidden text-gray-400 text-[9px] leading-none mt-0.5">
                      {gradeAlunosFiltrados.length} alunos
                    </div>
                  </th>
                  {/* Nome — hidden on mobile, sticky on desktop */}
                  <th className="hidden md:table-cell sticky top-0 left-20 z-30 border border-gray-600 px-1 py-1 text-left bg-gray-800 md:min-w-[260px]">
                    <button
                      type="button"
                      onClick={() => alternarOrdenacaoGrade("nome")}
                      className="w-full text-left hover:text-yellow-300 text-xs leading-tight"
                    >
                      Nome do Aluno {marcadorOrdenacao("nome")}
                    </button>
                    <div className="text-gray-400 text-[9px] leading-none mt-0.5">
                      Ativos: {gradeAlunosFiltrados.length}
                    </div>
                  </th>
                  {/* Day columns — sticky top only */}
                  {Array.from({ length: totalDiasMes }).map((_, idx) => {
                    const dia = idx + 1;
                    return (
                      <th
                        key={`day-${dia}`}
                        className="sticky top-0 z-20 border border-gray-600 px-1 py-1 bg-blue-900 text-center min-w-10 md:min-w-14"
                      >
                        <div className="text-[8px] md:text-[10px] text-blue-200 leading-none">
                          {nomeDiaSemana(dia)}
                        </div>
                        <div className="text-[11px] md:text-sm font-bold leading-tight">
                          {dia}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {gradeAlunosFiltrados.map((alunoGrade) => {
                  const alunoKey = String(alunoGrade.Alunos_Codigo);
                  return (
                    <tr key={`row-grade-${alunoKey}`}>
                      {/* Code cell — frozen on all sizes */}
                      <td className="sticky left-0 z-10 border border-gray-600 px-1 py-1 bg-gray-800 w-28 md:min-w-20 text-center align-top pt-1.5">
                        <div className="text-[10px] md:text-xs font-bold leading-none">
                          {alunoGrade.Alunos_Codigo}
                        </div>
                        {/* First + last name shown only on mobile where name col is hidden */}
                        {(() => {
                          const parts =
                            alunoGrade.Alunos_Nome.trim().split(/\s+/);
                          return (
                            <div className="md:hidden text-xs font-medium text-gray-200 leading-tight max-w-[96px] mx-auto mt-0.5">
                              <div className="truncate">{parts[0]}</div>
                              {parts.length > 1 && (
                                <div className="truncate">
                                  {parts[parts.length - 1]}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      {/* Name cell — hidden on mobile */}
                      <td className="hidden md:table-cell sticky left-20 z-10 border border-gray-600 px-1 py-1 bg-gray-800 md:min-w-[260px] overflow-hidden">
                        <span className="block truncate text-sm">
                          {alunoGrade.Alunos_Nome}
                        </span>
                      </td>
                      {Array.from({ length: totalDiasMes }).map((_, idx) => {
                        const dia = idx + 1;
                        const chaveData = toDateKey(
                          anoSelecionado,
                          mesSelecionadoIndex,
                          dia,
                        );
                        const status =
                          gradeMap[alunoKey]?.[chaveData]?.status || "";
                        const erroCelula =
                          errosGrade.mapaErros?.[alunoKey]?.[chaveData] || "";
                        const pendente = celulasPendentes.has(
                          `${alunoKey}|${chaveData}`,
                        );
                        const observacao = String(
                          gradeMap[alunoKey]?.[chaveData]?.observacao || "",
                        ).trim();
                        return (
                          <td
                            key={`cell-${alunoKey}-${dia}`}
                            onClick={() =>
                              !loadingGrade &&
                              alternarStatusGrade(alunoKey, dia)
                            }
                            className={`relative group border border-gray-700 text-center font-bold select-none ${
                              loadingGrade
                                ? "cursor-wait opacity-70"
                                : "cursor-pointer"
                            } ${statusClass(status)}`}
                          >
                            {(pendente || erroCelula) && (
                              <div
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  outline: "4px solid white",
                                  outlineOffset: "-4px",
                                  pointerEvents: "none",
                                  zIndex: 10,
                                }}
                              />
                            )}
                            <div className="min-h-[52px] md:min-h-[70px] flex flex-col items-center justify-center leading-none px-0.5">
                              <span>{legendaStatus(status)}</span>
                              {observacao && (
                                <span className="text-[9px] max-w-[34px] truncate opacity-90">
                                  {observacao}
                                </span>
                              )}
                              {!!status && (
                                <div className="mt-2 flex items-center gap-1">
                                  {!!status && (
                                    <span
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        abrirModalObservacaoGrade(
                                          alunoKey,
                                          chaveData,
                                        );
                                      }}
                                      className="text-[10px] leading-none bg-black/30 hover:bg-black/45 text-white px-1 rounded cursor-pointer"
                                      title={`Editar observação de ${chaveData}`}
                                    >
                                      ✎
                                    </span>
                                  )}
                                  {(status === "Reposicao" ||
                                    status === "Dobradinha") && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        abrirModalReposicaoGrade(
                                          alunoKey,
                                          chaveData,
                                        );
                                      }}
                                      className="text-[9px] leading-none bg-black/30 hover:bg-black/45 text-white px-1 rounded cursor-pointer"
                                      title={
                                        status === "Dobradinha"
                                          ? "Editar datas da dobradinha"
                                          : "Editar data de reposição"
                                      }
                                    >
                                      {status === "Dobradinha" ? "D" : "R"}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            {erroCelula && (
                              <>
                                <div className="pointer-events-none absolute z-30 left-1/2 -translate-x-1/2 bottom-[calc(100%+10px)] hidden md:block md:group-hover:block w-52 text-[10px] leading-tight bg-black text-yellow-100 border border-yellow-400 rounded-xl p-2 shadow-lg">
                                  <div className="font-bold mb-0.5">
                                    {chaveData}
                                  </div>
                                  <div>{erroCelula}</div>
                                  <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-[7px] border-t-yellow-400" />
                                  <div className="absolute left-1/2 -translate-x-1/2 top-[calc(100%-1px)] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-black" />
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setErroGradeMobileModal({
                                      open: true,
                                      alunoCodigo: alunoKey,
                                      data: chaveData,
                                      mensagem: erroCelula,
                                    });
                                  }}
                                  className="md:hidden mt-0.5 text-[9px] leading-none bg-violet-600 text-white px-1 rounded"
                                  title="Ver erro"
                                >
                                  ⚠
                                </button>
                              </>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {gradeAlunosFiltrados.length === 0 && (
                  <tr>
                    <td className="sticky left-0 z-10 border border-gray-600 px-2 py-2 bg-gray-800 min-w-20">
                      -
                    </td>
                    <td className="hidden md:table-cell sticky left-20 z-10 border border-gray-600 px-2 py-2 bg-gray-800 min-w-[200px] md:min-w-[260px]">
                      Nenhum aluno encontrado
                    </td>
                    {Array.from({ length: totalDiasMes }).map((_, idx) => (
                      <td
                        key={`empty-filter-${idx + 1}`}
                        className="border border-gray-700"
                      />
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-2 gap-2 md:gap-3">
            <p className="text-[11px] text-gray-400">
              Clique nas celulas para alternar status. Em R e D, use o botao da
              celula para informar as datas de falta.
            </p>
            {errosGrade.total > 0 && (
              <p className="text-[11px] text-yellow-300">
                {errosGrade.total} erro(s) detectado(s) na grade.
              </p>
            )}
            <button
              type="button"
              onClick={salvarMatrizPresencas}
              disabled={savingGrade || loadingGrade}
              className="bg-emerald-600 rounded-md px-3 py-2 border-2 border-gray-300 font-bold hover:bg-emerald-700 disabled:bg-gray-500 disabled:cursor-not-allowed"
            >
              {savingGrade ? "Salvando grade..." : "Salvar grade"}
            </button>
          </div>
        </div>
      </div>

      {reposicaoGradeModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg bg-gray-900 border border-gray-600 rounded-xl p-5">
            <h3 className="text-lg font-bold mb-3">Reposição na grade</h3>
            <p className="text-sm text-gray-300 mb-3">
              {nomeAlunoPorCodigoGrade(reposicaoGradeModal.alunoCodigo)} -
              {reposicaoGradeModal.tipo === "Dobradinha"
                ? ` dobradinha em ${reposicaoGradeModal.data.split("-").reverse().join("/")}`
                : ` reposição em ${reposicaoGradeModal.data.split("-").reverse().join("/")}`}
            </p>
            <div className="space-y-2">
              <input
                type="date"
                value={reposicaoGradeModal.valor || ""}
                onChange={(e) =>
                  setReposicaoGradeModal((prev) => ({
                    ...prev,
                    valor: e.target.value,
                  }))
                }
                className="w-full border border-gray-300 rounded-md p-2 bg-white text-black"
              />
              {reposicaoGradeModal.tipo === "Dobradinha" && (
                <input
                  type="date"
                  value={reposicaoGradeModal.valor2 || ""}
                  onChange={(e) =>
                    setReposicaoGradeModal((prev) => ({
                      ...prev,
                      valor2: e.target.value,
                    }))
                  }
                  className="w-full border border-gray-300 rounded-md p-2 bg-white text-black"
                />
              )}
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button
                type="button"
                onClick={() => {
                  setReposicaoGradeModal({
                    open: false,
                    alunoCodigo: "",
                    data: "",
                    tipo: "Reposicao",
                    valor: "",
                    valor2: "",
                  });
                }}
                className="bg-gray-600 text-white p-2 border-2 rounded-md border-gray-300 hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!String(reposicaoGradeModal.valor || "").trim()) {
                    showToast({
                      type: "error",
                      text: "Informe a data de falta da reposição.",
                    });
                    return;
                  }
                  if (
                    reposicaoGradeModal.tipo === "Dobradinha" &&
                    (!String(reposicaoGradeModal.valor2 || "").trim() ||
                      String(reposicaoGradeModal.valor2 || "").trim() ===
                        String(reposicaoGradeModal.valor || "").trim())
                  ) {
                    showToast({
                      type: "error",
                      text: "Dobradinha exige duas datas de falta diferentes.",
                    });
                    return;
                  }
                  setGradeMap((prev) => {
                    const alunoKey = reposicaoGradeModal.alunoCodigo;
                    const data = reposicaoGradeModal.data;
                    const mapaAluno = { ...(prev[alunoKey] || {}) };
                    mapaAluno[data] = {
                      ...(mapaAluno[data] || {}),
                      status: reposicaoGradeModal.tipo,
                      dataReposicaoReferencia: reposicaoGradeModal.valor,
                      dataReposicaoReferencia2:
                        reposicaoGradeModal.tipo === "Dobradinha"
                          ? reposicaoGradeModal.valor2
                          : "",
                    };
                    return { ...prev, [alunoKey]: mapaAluno };
                  });
                  setCelulasPendentes((prev) =>
                    new Set(prev).add(
                      `${reposicaoGradeModal.alunoCodigo}|${reposicaoGradeModal.data}`,
                    ),
                  );
                  setReposicaoGradeModal({
                    open: false,
                    alunoCodigo: "",
                    data: "",
                    tipo: "Reposicao",
                    valor: "",
                    valor2: "",
                  });
                }}
                className="bg-emerald-600 rounded-md p-2 border-2 border-gray-300 font-bold hover:bg-emerald-700"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {erroGradeMobileModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 md:hidden">
          <div className="w-full max-w-sm bg-gray-900 border border-yellow-400 rounded-xl p-5">
            <h3 className="text-lg font-bold mb-2 text-yellow-200">
              Erro na celula
            </h3>
            <p className="text-sm text-gray-300 mb-1">
              {nomeAlunoPorCodigoGrade(erroGradeMobileModal.alunoCodigo)}
            </p>
            <p className="text-sm text-gray-300 mb-3">
              Data: {erroGradeMobileModal.data}
            </p>
            <p className="text-sm text-yellow-100">
              {erroGradeMobileModal.mensagem}
            </p>
            <div className="flex justify-end mt-5">
              <button
                type="button"
                onClick={() =>
                  setErroGradeMobileModal({
                    open: false,
                    alunoCodigo: "",
                    data: "",
                    mensagem: "",
                  })
                }
                className="bg-gray-600 text-white p-2 border-2 rounded-md border-gray-300 hover:bg-gray-700"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {observacaoGradeModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg bg-gray-900 border border-gray-600 rounded-xl p-5">
            <h3 className="text-lg font-bold mb-3">Observacao da grade</h3>
            <p className="text-sm text-gray-300 mb-3">
              {nomeAlunoPorCodigoGrade(observacaoGradeModal.alunoCodigo)} -{" "}
              {observacaoGradeModal.data}
            </p>
            <textarea
              value={observacaoGradeModal.texto}
              onChange={(e) =>
                setObservacaoGradeModal((prev) => ({
                  ...prev,
                  texto: e.target.value,
                }))
              }
              rows={4}
              maxLength={240}
              className="w-full border border-gray-300 rounded-md p-2 bg-white text-black"
              placeholder="Escreva uma observacao para esta celula (opcional)"
            />
            <p className="text-xs text-gray-400 mt-1">
              {observacaoGradeModal.texto.length}/240
            </p>
            <div className="flex justify-end gap-3 mt-5">
              <button
                type="button"
                onClick={() =>
                  setObservacaoGradeModal({
                    open: false,
                    alunoCodigo: "",
                    data: "",
                    texto: "",
                  })
                }
                className="bg-gray-600 text-white p-2 border-2 rounded-md border-gray-300 hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvarObservacaoGrade}
                className="bg-emerald-600 rounded-md p-2 border-2 border-gray-300 font-bold hover:bg-emerald-700"
              >
                Salvar observacao
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RegistrarPresenca;
