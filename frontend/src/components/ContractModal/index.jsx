import { useEffect, useRef, useState } from "react";
import Button from "../Button";
import Modal from "../Modal";
import melPetHostelHeaderImage from "../../pages/MelPetHostel/assets/MelPetHostel_Background.png";
import "./styles.css";

const EMPTY_CONTRACTOR = {
  nome: "",
  rg: "",
  cpf: "",
  telefones: "",
  email: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  cep: "",
};

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function normalizeContractorData(data) {
  return {
    ...EMPTY_CONTRACTOR,
    ...(data || {}),
  };
}

function hasImportedContractorData(data) {
  return Object.values(data || {}).some((value) => clean(value));
}

function maskCpf(value) {
  const digits = onlyDigits(value).slice(0, 11);
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 9);
  const p4 = digits.slice(9, 11);

  if (digits.length <= 3) return p1;
  if (digits.length <= 6) return `${p1}.${p2}`;
  if (digits.length <= 9) return `${p1}.${p2}.${p3}`;
  return `${p1}.${p2}.${p3}-${p4}`;
}

function maskCep(value) {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function maskRg(value) {
  const raw = String(value || "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, 9);

  const p1 = raw.slice(0, 2);
  const p2 = raw.slice(2, 5);
  const p3 = raw.slice(5, 8);
  const p4 = raw.slice(8, 9);

  if (raw.length <= 2) return p1;
  if (raw.length <= 5) return `${p1}.${p2}`;
  if (raw.length <= 8) return `${p1}.${p2}.${p3}`;
  return `${p1}.${p2}.${p3}-${p4}`;
}

function maskSinglePhone(digits) {
  const d = onlyDigits(digits).slice(0, 11);
  if (d.length <= 2) return d;

  const ddd = d.slice(0, 2);
  const rest = d.slice(2);

  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  if (rest.length <= 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
}

function maskPhones(value) {
  const digits = onlyDigits(value).slice(0, 22);
  const first = digits.slice(0, 11);
  const second = digits.slice(11, 22);
  const firstMasked = maskSinglePhone(first);
  const secondMasked = second ? maskSinglePhone(second) : "";

  if (!secondMasked) return firstMasked;
  return `${firstMasked} / ${secondMasked}`;
}

function formatDateLong(dateValue) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(dateValue);
}

function formatTime(dateValue) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(dateValue);
}

function getBrowserName() {
  const ua = navigator.userAgent;

  if (ua.includes("Edg/")) return "Microsoft Edge";
  if (ua.includes("OPR/") || ua.includes("Opera")) return "Opera";
  if (ua.includes("Chrome/")) return "Google Chrome";
  if (ua.includes("Firefox/")) return "Mozilla Firefox";
  if (ua.includes("Safari/")) return "Safari";
  return "Navegador não identificado";
}

function ContractSection({ number, title, children }) {
  const clausePrefix = String(number || "").replace(/\.$/, "");

  return (
    <section
      className="contract-section"
      style={{ "--clause-prefix": `"${clausePrefix}"` }}
    >
      <h3>
        <span className="contract-section-number">{number}</span>
        <span>{title}</span>
      </h3>
      <div className="contract-section-body">{children}</div>
    </section>
  );
}

function ContractModal({
  isOpen,
  initialContractorData,
  onClose,
  onGovBrSign,
  onRejectBeforeAccept,
}) {
  const govBrSignerUrl = "https://assinador.iti.br/assinatura/index.xhtml";
  const [contractorData, setContractorData] = useState(EMPTY_CONTRACTOR);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepFeedback, setCepFeedback] = useState("");
  const [signatureMoment, setSignatureMoment] = useState(new Date());
  const [clientIp, setClientIp] = useState("IP não disponível");
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [contractPdfSaved, setContractPdfSaved] = useState(false);
  const [saveDialogPending, setSaveDialogPending] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const lastCepLookupRef = useRef("");
  const currentCepDigitsRef = useRef("");
  const contractorFieldsLocked = hasImportedContractorData(
    initialContractorData,
  );
  const cepDigits = onlyDigits(contractorData.cep);
  const addressLookupLocked = cepLoading || cepDigits.length !== 8;
  const addressLocked = contractorFieldsLocked || addressLookupLocked;
  const importedFieldProps = contractorFieldsLocked
    ? {
        readOnly: true,
        "aria-readonly": true,
        className: "is-readonly",
      }
    : {};
  const browserName = getBrowserName();
  const signatureCity = contractorData.cidade?.trim() || "Cidade não informada";
  const signatureDate = formatDateLong(signatureMoment);
  const signatureTime = formatTime(signatureMoment);

  useEffect(() => {
    if (isOpen) {
      const nextContractorData = normalizeContractorData(initialContractorData);
      setContractorData(nextContractorData);
      setCepLoading(false);
      setCepFeedback("");
      setSignatureMoment(new Date());
      setClientIp("IP não disponível");
      setContractPdfSaved(false);
      setSaveDialogPending(false);
      setRejectDialogOpen(false);
      lastCepLookupRef.current = "";
      currentCepDigitsRef.current = onlyDigits(nextContractorData.cep);
    }
  }, [initialContractorData, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const controller = new AbortController();

    fetch("https://api.ipify.org?format=json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Falha ao obter IP");
        return response.json();
      })
      .then((data) => {
        setClientIp(data?.ip || "IP não disponível");
      })
      .catch(() => {
        setClientIp("IP não disponível");
      });

    return () => controller.abort();
  }, [isOpen]);

  function clearAutofilledAddressFields() {
    setContractorData((prev) => ({
      ...prev,
      endereco: "",
      bairro: "",
      cidade: "",
      estado: "",
    }));
  }

  function updateField(field, value) {
    setContractorData((prev) => ({ ...prev, [field]: value }));
  }

  async function lookupCepAndFill(cepValue) {
    const cepDigits = onlyDigits(cepValue);
    if (cepDigits.length !== 8) return;
    if (lastCepLookupRef.current === cepDigits) return;

    lastCepLookupRef.current = cepDigits;
    setCepLoading(true);
    setCepFeedback("");

    try {
      // BuscaCEP: using ViaCEP public endpoint for CEP lookup.
      const response = await fetch(
        `https://viacep.com.br/ws/${cepDigits}/json/`,
      );
      if (!response.ok) throw new Error("Falha ao consultar CEP");

      const data = await response.json();
      if (data.erro) throw new Error("CEP não encontrado");

      if (currentCepDigitsRef.current !== cepDigits) {
        return;
      }

      setContractorData((prev) => ({
        ...prev,
        endereco: data.logradouro || prev.endereco,
        bairro: data.bairro || prev.bairro,
        cidade: data.localidade || prev.cidade,
        estado: (data.uf || prev.estado || "").toUpperCase(),
      }));
      setCepFeedback("Endereço preenchido automaticamente.");
    } catch (error) {
      setCepFeedback("Não foi possível localizar o CEP automaticamente.");
    } finally {
      setCepLoading(false);
    }
  }

  function handleCepChange(value) {
    const masked = maskCep(value);
    const cepDigits = onlyDigits(masked);

    currentCepDigitsRef.current = cepDigits;
    updateField("cep", masked);

    if (cepDigits.length === 8) {
      lookupCepAndFill(masked);
    } else {
      clearAutofilledAddressFields();
      setCepFeedback("");
      setCepLoading(false);
      if (cepDigits.length < 8) {
        lastCepLookupRef.current = "";
      }
    }
  }

  async function handleAccept(e) {
    e.preventDefault();
    if (pdfGenerating) return;

    const acceptMoment = new Date();
    setSignatureMoment(acceptMoment);
    setPdfGenerating(true);
    setSaveDialogPending(true);

    try {
      const { saveContractPdf } = await import("./contractPdfService");
      const didSavePdf = await saveContractPdf({
        browserName,
        clientIp,
        contractorData,
        signatureCity: contractorData.cidade?.trim() || "Cidade nao informada",
        signatureDate: formatDateLong(acceptMoment),
        signatureTime: formatTime(acceptMoment),
      });
      setContractPdfSaved(didSavePdf);
    } catch (error) {
      console.error("Erro ao gerar o PDF do contrato:", error);
      window.alert("Nao foi possivel gerar o PDF do contrato.");
    } finally {
      setPdfGenerating(false);
      setSaveDialogPending(false);
    }
  }

  function handleGovBrClick() {
    window.open(govBrSignerUrl, "_blank", "noopener,noreferrer");
    if (onGovBrSign) {
      onGovBrSign();
    }
  }

  function handleSecondaryAction() {
    if (contractPdfSaved) {
      onClose();
      return;
    }

    setRejectDialogOpen(true);
  }

  function handleConfirmReject() {
    setRejectDialogOpen(false);

    if (onRejectBeforeAccept) {
      onRejectBeforeAccept();
      return;
    }

    onClose();
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="INSTRUMENTO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS ESPECIALIZADOS PARA PETS"
        hideHeader
        closeOnBackdropClick={false}
        containerStyle={{ maxWidth: 980, overflow: "hidden" }}
        contentStyle={{ padding: 0, overflow: "hidden" }}
      >
        <form className="contract-modal" onSubmit={handleAccept}>
          <div className="contract-document">
            <header
              className="contract-hero contract-hero--with-background"
              style={{ backgroundImage: `url(${melPetHostelHeaderImage})` }}
            >
              <div className="contract-hero-overlay">
                <p className="contract-summary">
                  LEITURA E ACEITE OBRIGATÓRIOS. AO CONCORDAR, O(A) CONTRATANTE
                  DECLARA TER CIÊNCIA INTEGRAL DAS CONDIÇÕES ABAIXO.
                </p>
                <div className="contract-legal-note">
                  DOCUMENTO CONTRATUAL PARA ACEITE ELETRÔNICO
                </div>
              </div>
            </header>

            <div className="contract-scroll">
              <article className="contract-paper">
                <p className="contract-intro">
                  Pelo presente instrumento particular de prestação de serviços,
                  de um lado MEL PET HOSTEL, instalada à Rua: Caviúna, 1 – Alpes
                  Paulista – Mailasqui – São Roque – SP, doravante denominada
                  CONTRATADA, e de outro o(a) TUTOR(A)/RESPONSÁVEL LEGAL PELO
                  PET, abaixo identificado(a), doravante denominado(a)
                  CONTRATANTE, têm entre si justo e acordado o que segue:
                </p>

                <ContractSection number="1." title="OBJETO">
                  <p>
                    <strong>1.1.</strong> O presente contrato tem como objeto a
                    prestação de serviços de hospedagem, creche, residência,
                    recreação, cuidados básicos e manejo diário do pet do(a)
                    CONTRATANTE, conforme pacote e período previamente acordados
                    e descriminados no final deste contrato.
                  </p>
                </ContractSection>

                <ContractSection
                  number="2."
                  title="SÃO RESPONSABILIDADES DA CONTRATADA"
                >
                  <ol>
                    <li>
                      A alimentação, com a ração deixada pelo proprietário em
                      embalagem lacrada e identificada ou com insumos próprios
                      acordados no ato do check-in.
                    </li>
                    <li>Guarda e integridade física do pet.</li>
                    <li>Manejo do pet de acordo com as necessidades.</li>
                    <li>
                      Observação rigorosa das instruções dos tutores, constantes
                      na ficha de entrada, sobre alimentação, medicação (sempre
                      com receituário de profissional de saúde animal), estado
                      de saúde e eventuais recomendações/orientações.
                    </li>
                    <li>
                      Comunicação ao tutor acerca de necessidade de intervenção
                      médico-veterinária com acompanhamento do pet à clínica
                      médica de escolha do CONTRATANTE.
                    </li>
                    <li>
                      Informar ao tutor do pet todos e quaisquer sintomas e
                      dificuldades sejam quais forem, ou mudanças
                      comportamentais.
                    </li>
                    <li>
                      Manutenção das instalações na mais perfeita limpeza e
                      higiene atendendo todas as obrigações legais.
                    </li>
                  </ol>
                </ContractSection>

                <ContractSection number="3." title="SÃO DIREITOS DA CONTRATADA">
                  <ol>
                    <li>
                      Não aceitar animais que não se adaptem à permanência em
                      suas instalações, tais como:
                      <div className="contract-subitems">
                        <p>
                          a) animais antissociais que impossibilitem o manejo e
                          tratamento.
                        </p>
                        <p>
                          b) animais portadores ou com suspeita de doenças
                          contagiosas.
                        </p>
                        <p>c) fêmeas em período de estro (cio).</p>
                      </div>
                      <p className="contract-note">
                        <strong>Obs.:</strong> Caso a fêmea entre no estro (cio)
                        durante o período de hospedagem será cobrada taxa
                        adicional diária de R$100,00 para área exclusiva, a
                        isolando do contato com outros pets. A CONTRATADA não se
                        responsabilizará por eventual acasalamento, ou outras
                        consequências causados diretamente.
                      </p>
                    </li>
                    <li>
                      Ressarcimento, pelo CONTRATANTE, de todas as despesas com
                      médicos, medicações e clínicas veterinárias em caso de
                      necessidade de atendimento urgente por acidente ou motivos
                      alheios ao controle da CONTRATADA.
                    </li>
                    <li>
                      A não devolução de valores pagos e não utilizados por
                      decisão pessoal e não justificável do CONTRATANTE. Em caso
                      de desistência com até 48 horas antes da data de entrada
                      (check-in), o CONTRATANTE terá o ressarcimento de 50% do
                      valor referente a reserva da vaga.
                    </li>
                    <li>
                      Proibição de pertences que possam representar perigo para
                      qualquer hóspede ou funcionário do hotel, tais como
                      brinquedos que soltem apitos, que possam ser engolidos,
                      tóxicos ou inadequados. Tais objetos serão recusados no
                      check-in ou, se identificados durante a estadia, serão
                      guardados e devolvidos ao CONTRATANTE no check-out.
                    </li>
                  </ol>
                </ContractSection>

                <ContractSection number="4." title="SÃO DEVERES DO CONTRATANTE">
                  <ol>
                    <li>
                      Informar, na ficha de check-in, todos os seus dados
                      pessoais e de contato (protegidos pela LGPD), inclusive
                      para emergências, como autorização prévia e formal para
                      que terceiros retirem o pet caso exista essa
                      possibilidade.
                    </li>
                    <li>
                      Identificação de todos os pertences do pet quando da
                      entrega no check-in.
                    </li>
                    <li>
                      Fornecer comprovante de que o pet encontra-se clinicamente
                      saudável, com vacinação (atestado de vacina atualizado:
                      mínimo de 20 dias de vacinação com as vacinas V10 e raiva
                      e 15 dias da vacina de gripe canina), vermifugação e
                      controle de ectoparasitas em dia (aplicação de
                      anti-pulgas/carrapatos).
                    </li>
                    <li>
                      Assumir total responsabilidade por doenças pré-existentes,
                      crônicas, genéticas, comportamentais ou não informadas,
                      isentando a CONTRATADA de qualquer responsabilidade.
                    </li>
                    <li>
                      Informar, com antecedência mínima de 24 horas, a intenção
                      de prorrogar a permanência do pet e qual o período
                      desejado, quitando de imediato e integralmente a nova
                      contratação. A não comunicação acarretará acréscimo de 50%
                      (cinquenta por cento) no valor da diária, haja vista a
                      possível perda de reserva de outros hóspedes.
                    </li>
                    <li>
                      Pagamento das obrigações financeiras (incluindo as
                      elencadas na cláusula 3) e arcar com quaisquer despesas
                      extras prestadas por terceiros, desde que autorizadas
                      (banho e tosa, transporte, medicamentos do pet, etc.),
                      inclusive danos às instalações comprovadas pela
                      CONTRATADA. Tais despesas deverão ser quitadas no
                      check-out e o atraso poderá acarretar multa de 2% e juros
                      de 0,33% ao dia limitado a 10% ao mês.
                    </li>
                    <li>
                      Avaliar o pet e seus pertences no check-out, nada podendo
                      reclamar posteriormente.
                    </li>
                  </ol>
                </ContractSection>

                <ContractSection
                  number="5."
                  title="SÃO DIREITOS DO CONTRATANTE"
                >
                  <ol>
                    <li>
                      São direitos do(a) CONTRATANTE, sem prejuízo das demais
                      disposições contratuais, a escolha do pacote que melhor
                      atenda suas exigências.
                    </li>
                    <li>
                      À informação: o CONTRATANTE tem direito de receber
                      informações gerais sobre a adaptação, rotina e bem-estar
                      do pet durante o período de hospedagem ou creche, dentro
                      dos horários e canais estabelecidos pela CONTRATADA.
                    </li>
                    <li>
                      À transparência: o CONTRATANTE tem direito à clareza
                      prévia quanto às regras, funcionamento, valores, pacotes,
                      horários, políticas internas e limites dos serviços
                      oferecidos pela Mel Pet Hostel.
                    </li>
                    <li>
                      À individualidade do pet: a CONTRATADA compromete-se a
                      respeitar as características individuais do pet, dentro
                      das possibilidades do serviço contratado e sem garantia de
                      tratamento exclusivo, salvo contratação específica.
                    </li>
                    <li>
                      À segurança básica: o CONTRATANTE tem o direito de que seu
                      pet seja mantido em ambiente seguro, higienizado e
                      supervisionado, de acordo com as boas práticas de manejo
                      animal.
                    </li>
                    <li>
                      Interrupção voluntária: o CONTRATANTE poderá solicitar a
                      retirada antecipada do pet, desde que respeitados os
                      horários e regras internas da CONTRATADA, sem direito a
                      reembolso de valores pagos.
                    </li>
                    <li>
                      Ao uso de imagem (com consentimento): o CONTRATANTE tem o
                      direito de autorizar ou não o uso da imagem do pet para
                      fins institucionais e publicitários da Mel Pet Hostel,
                      conforme termo específico.
                    </li>
                    <li>
                      À privacidade: os dados pessoais do CONTRATANTE e do pet
                      serão utilizados exclusivamente para fins de prestação de
                      serviço, comunicação e segurança, respeitando a legislação
                      vigente (LGPD).
                    </li>
                    <li>
                      De ser ouvido: o CONTRATANTE poderá apresentar sugestões,
                      dúvidas ou observações, as quais serão analisadas pela
                      CONTRATADA sem obrigação de adoção ou alteração de
                      procedimentos internos.
                    </li>
                  </ol>
                </ContractSection>

                <ContractSection
                  number="6."
                  title="RISCOS INERENTES À ATIVIDADE"
                >
                  <ol>
                    <li>
                      O(a) CONTRATANTE está ciente de que atividades em grupo,
                      convivência com outros animais e ambientes abertos
                      envolvem riscos naturais, tais como:
                      <div className="contract-note">
                        <ul className="contract-note-list">
                          <li>Escoriações leves;</li>
                          <li>Quedas;</li>
                          <li>Arranhões;</li>
                          <li>Mudanças comportamentais temporárias;</li>
                          <li>
                            Alterações intestinais leves decorrentes de
                            adaptação.
                          </li>
                        </ul>
                      </div>
                    </li>
                    <li>
                      A CONTRATADA não se responsabiliza por tais ocorrências
                      quando decorrentes do convívio natural entre pets.
                    </li>
                  </ol>
                </ContractSection>

                <ContractSection number="7." title="DO FUNCIONAMENTO">
                  <ol>
                    <li>
                      As reservas serão confirmadas mediante o pagamento de 50%
                      (cinquenta por cento) do valor apurado para o período. Os
                      50% (cinquenta por cento) restantes deverão ser pagos no
                      ato do check-in. Não haverá devolução de valores por
                      interrupção da permanência antes do final da reserva.
                    </li>
                    <li>
                      O horário para check-in e check-out é das 8h às 18h em
                      dias úteis e das 10h às 15h aos finais de semana e
                      feriados. Não serão aceitas entradas/saídas fora desses
                      horários.
                    </li>
                  </ol>
                </ContractSection>

                <ContractSection number="8." title="RESPONSABILIDADE">
                  <ol>
                    <li>
                      O CONTRATANTE declara estar ciente e de acordo que a
                      CONTRATADA não poderá ser responsabilizada, civil ou
                      criminalmente, por quaisquer ocorrências não decorrentes
                      de dolo ou negligência comprovada, bem como isenta,
                      expressamente, a CONTRATADA de qualquer responsabilidade
                      por danos físicos, emocionais ou comportamentais
                      decorrentes da adaptação do pet. A omissão, inexatidão ou
                      falsidade de informações relativas à saúde, comportamento
                      ou temperamento do pet, por parte do CONTRATANTE o tornará
                      integralmente responsável por quaisquer danos causados
                      pelo pet (e suas ações), instalações ou aos demais
                      hóspedes, salvo nos casos de comprovada negligência ou
                      descumprimento contratual por parte da CONTRATADA.
                    </li>
                    <li>
                      Em caso de situação emergencial ou de urgência, que possa
                      representar risco à vida do pet, a Mel Pet Hostel fica
                      desde já expressamente autorizada a encaminhar o animal
                      para clínica veterinária a mais próxima e de sua
                      confiança, visando a preservação da integridade física e
                      do bem-estar do pet.
                    </li>
                    <li>
                      O(a) TUTOR(A)/RESPONSÁVEL LEGAL declara estar ciente de
                      que todos os custos decorrentes do atendimento
                      veterinário, incluindo, mas não se limitando a consultas,
                      exames, internações, procedimentos, medicamentos e
                      transporte, serão de inteira e exclusiva responsabilidade
                      do(a) tutor(a).
                    </li>
                    <li>
                      A Mel Pet Hostel compromete-se a comunicar o tutor(a) o
                      mais breve e assim que possível, não sendo
                      responsabilizada por eventuais decisões clínicas adotadas
                      pelo médico veterinário responsável, tampouco por
                      desfechos decorrentes do quadro clínico do animal, desde
                      que não haja dolo ou negligência comprovada por parte da
                      Mel Pet Hostel.
                    </li>
                    <li>
                      RESPONSABILIDADE EXCLUSIVAMENTE EM CASO DE ESTRO (CIO) E
                      CONFLITOS ENTRE ANIMAIS:
                      <div className="contract-subitems">
                        <p>
                          O(a) TUTOR(A)/RESPONSÁVEL LEGAL declara estar ciente
                          de que a presença de fêmea em período de estro (cio)
                          em ambiente de convivência com outros pets,
                          especialmente machos, pode gerar comportamentos
                          instintivos, tais como agitação, disputas, tentativas
                          de monta, brigas e eventuais ferimentos.
                        </p>
                        <p>
                          Fica expressamente estabelecido que, em caso de
                          conflitos, brigas, acidentes, ferimentos, necessidade
                          de atendimento veterinário, uso de medicamentos,
                          internações ou quaisquer outras consequências
                          decorrentes direta ou indiretamente do cio de fêmea, a
                          responsabilidade será exclusiva e integral do(a)
                          tutor(a) da fêmea em período de estro (cio).
                        </p>
                        <p>
                          Nestes casos, a Mel Pet Hostel não poderá ser
                          responsabilizada, civil ou criminalmente, por
                          quaisquer danos, custos ou desdobramentos, desde que
                          não haja dolo ou negligência comprovada por parte da
                          CONTRATADA.
                        </p>
                        <p>
                          Da mesma forma, fica expressamente acordado que os
                          tutores dos machos envolvidos não poderão ser
                          responsabilizados, uma vez que os comportamentos
                          apresentados decorrem de instinto natural da espécie,
                          potencializado pela condição de cio da fêmea.
                        </p>
                        <p>
                          Todos os custos veterinários, tratamentos,
                          medicamentos, exames e demais despesas eventualmente
                          necessários em razão de tais ocorrências serão de
                          inteira responsabilidade do(a) tutor(a) da fêmea em
                          estro (cio).
                        </p>
                      </div>
                    </li>
                  </ol>
                </ContractSection>

                <ContractSection number="9." title="DISPOSIÇÕES FINAIS">
                  <ol>
                    <li>
                      Este contrato entra em vigor a partir da data da
                      assinatura.
                    </li>
                    <li>
                      O foro eleito para dirimir quaisquer dúvidas é o da
                      comarca do estabelecimento da CONTRATADA.
                    </li>
                  </ol>
                </ContractSection>

                <ContractSection number="10." title="DADOS DO CONTRATANTE">
                  <div className="contract-form-grid">
                    <label className="contract-field contract-field--full">
                      <span>Nome</span>
                      <input
                        type="text"
                        name="nome"
                        value={contractorData.nome}
                        onChange={(e) => updateField("nome", e.target.value)}
                        placeholder="Nome completo"
                        required
                        {...importedFieldProps}
                      />
                    </label>

                    <label className="contract-field">
                      <span>RG n°</span>
                      <input
                        type="text"
                        name="rg"
                        value={contractorData.rg}
                        onChange={(e) =>
                          updateField("rg", maskRg(e.target.value))
                        }
                        placeholder="00.000.000-0"
                        inputMode="text"
                        maxLength={12}
                        required
                        {...importedFieldProps}
                      />
                    </label>

                    <label className="contract-field">
                      <span>CPF n°</span>
                      <input
                        type="text"
                        name="cpf"
                        value={contractorData.cpf}
                        onChange={(e) =>
                          updateField("cpf", maskCpf(e.target.value))
                        }
                        placeholder="CPF"
                        inputMode="numeric"
                        maxLength={14}
                        required
                        {...importedFieldProps}
                      />
                    </label>

                    <label className="contract-field contract-field--full">
                      <span>Telefones</span>
                      <input
                        type="text"
                        name="telefones"
                        value={contractorData.telefones}
                        onChange={(e) =>
                          updateField("telefones", maskPhones(e.target.value))
                        }
                        placeholder="(00) 00000-0000 / (00) 0000-0000"
                        inputMode="tel"
                        maxLength={34}
                        required
                        {...importedFieldProps}
                      />
                    </label>

                    <label className="contract-field contract-field--full">
                      <span>E-mail</span>
                      <input
                        type="email"
                        name="email"
                        value={contractorData.email}
                        onChange={(e) => updateField("email", e.target.value)}
                        placeholder="email@exemplo.com"
                        required
                        {...importedFieldProps}
                      />
                    </label>

                    <div className="contract-address-grid contract-field--full">
                      <label className="contract-field contract-field--full">
                        <span>CEP</span>
                        <input
                          type="text"
                          name="cep"
                          value={contractorData.cep}
                          onChange={(e) => handleCepChange(e.target.value)}
                          onBlur={(e) =>
                            !contractorFieldsLocked &&
                            lookupCepAndFill(e.target.value)
                          }
                          placeholder="00000-000"
                          inputMode="numeric"
                          maxLength={9}
                          required
                          {...importedFieldProps}
                        />
                        {(cepLoading || cepFeedback) && (
                          <small className="contract-field-help">
                            {cepLoading ? "Buscando CEP..." : cepFeedback}
                          </small>
                        )}
                      </label>

                      <div className="contract-inline-pair contract-field--full">
                        <label className="contract-field contract-inline-number">
                          <span>Número</span>
                          <input
                            type="text"
                            name="numero"
                            autoComplete="off"
                            value={contractorData.numero}
                            onChange={(e) =>
                              updateField("numero", e.target.value)
                            }
                            placeholder="Nº"
                            required
                            {...importedFieldProps}
                          />
                        </label>

                        <label className="contract-field contract-inline-complement">
                          <span>Complemento</span>
                          <input
                            type="text"
                            name="complemento"
                            autoComplete="off"
                            value={contractorData.complemento}
                            onChange={(e) =>
                              updateField("complemento", e.target.value)
                            }
                            placeholder="Apto, casa, bloco..."
                            {...importedFieldProps}
                          />
                        </label>
                      </div>

                      <label className="contract-field contract-field--street">
                        <span>Endereço</span>
                        <input
                          type="text"
                          name="endereco"
                          value={contractorData.endereco}
                          disabled={addressLookupLocked}
                          readOnly={contractorFieldsLocked}
                          aria-disabled={addressLookupLocked}
                          aria-readonly={contractorFieldsLocked}
                          className={
                            addressLocked
                              ? contractorFieldsLocked
                                ? "is-readonly"
                                : "is-disabled"
                              : ""
                          }
                          onChange={(e) =>
                            updateField("endereco", e.target.value)
                          }
                          placeholder="Logradouro"
                          required
                        />
                      </label>

                      <label className="contract-field contract-field--bairro">
                        <span>Bairro</span>
                        <input
                          type="text"
                          name="bairro"
                          value={contractorData.bairro}
                          disabled={addressLookupLocked}
                          readOnly={contractorFieldsLocked}
                          aria-disabled={addressLookupLocked}
                          aria-readonly={contractorFieldsLocked}
                          className={
                            addressLocked
                              ? contractorFieldsLocked
                                ? "is-readonly"
                                : "is-disabled"
                              : ""
                          }
                          onChange={(e) =>
                            updateField("bairro", e.target.value)
                          }
                          placeholder="Bairro"
                          required
                        />
                      </label>

                      <label className="contract-field contract-field--cidade">
                        <span>Cidade</span>
                        <input
                          type="text"
                          name="cidade"
                          value={contractorData.cidade}
                          disabled={addressLookupLocked}
                          readOnly={contractorFieldsLocked}
                          aria-disabled={addressLookupLocked}
                          aria-readonly={contractorFieldsLocked}
                          className={
                            addressLocked
                              ? contractorFieldsLocked
                                ? "is-readonly"
                                : "is-disabled"
                              : ""
                          }
                          onChange={(e) =>
                            updateField("cidade", e.target.value)
                          }
                          placeholder="Cidade"
                          required
                        />
                      </label>

                      <label className="contract-field contract-field--uf">
                        <span>Estado</span>
                        <input
                          type="text"
                          name="estado"
                          maxLength={2}
                          value={contractorData.estado}
                          disabled={addressLookupLocked}
                          readOnly={contractorFieldsLocked}
                          aria-disabled={addressLookupLocked}
                          aria-readonly={contractorFieldsLocked}
                          className={
                            addressLocked
                              ? contractorFieldsLocked
                                ? "is-readonly"
                                : "is-disabled"
                              : ""
                          }
                          onChange={(e) =>
                            updateField(
                              "estado",
                              e.target.value
                                .toUpperCase()
                                .replace(/[^A-Z]/g, "")
                                .slice(0, 2),
                            )
                          }
                          placeholder="UF"
                          required
                        />
                      </label>
                    </div>
                  </div>
                </ContractSection>

                <div className="contract-signature-block">
                  <p className="contract-signature-text">
                    Declaro que todas as informações por mim fornecidas são
                    verdadeiras, completas e atualizadas, sendo de minha inteira
                    responsabilidade sua veracidade.
                  </p>
                  <p className="contract-signature-text">
                    Estou ciente de que a omissão ou prestação de informações
                    falsas poderá resultar na rescisão imediata deste contrato,
                    sem prejuízo da adoção das medidas legais cabíveis.
                  </p>
                  <p className="contract-signature-text">
                    Declaro, ainda, que li integralmente o presente instrumento,
                    compreendi seu conteúdo e estou de pleno acordo com todas as
                    condições nele estabelecidas.
                  </p>
                  <div className="contract-signature-line" />
                  <p className="contract-signature-name">
                    {contractorData.nome || " "}
                  </p>
                  <p className="contract-signature-label">
                    CONTRATANTE (TUTOR/RESPONSÁVEL LEGAL)
                  </p>
                  <p className="contract-signature-meta">
                    {`${signatureCity}, ${signatureDate}`}
                  </p>
                  <p className="contract-signature-meta">
                    {`${signatureTime} | IP: ${clientIp} | Navegador: ${browserName}`}
                  </p>
                </div>
              </article>
            </div>
          </div>

          <footer className="contract-actions">
            <p className="contract-footer-text">
              O ACEITE FORMALIZA A CIÊNCIA DO CONTRATANTE SOBRE TODAS AS
              CLÁUSULAS, DIREITOS, DEVERES E RESPONSABILIDADES AQUI DESCRITOS.
            </p>
            {!contractPdfSaved ? (
              <Button type="submit" disabled={pdfGenerating}>
                {pdfGenerating
                  ? "Gerando PDF..."
                  : "Li e concordo com os termos"}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={pdfGenerating || saveDialogPending}
                onClick={handleGovBrClick}
              >
                Assinar com Gov.BR (E-CPF)
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={handleSecondaryAction}
            >
              {contractPdfSaved ? "Vou assinar Depois" : "Sair sem aceitar"}
            </Button>
          </footer>
        </form>
      </Modal>

      <Modal
        isOpen={rejectDialogOpen}
        onClose={() => {}}
        hideHeader
        closeOnBackdropClick={false}
        containerStyle={{ maxWidth: 430 }}
      >
        <div className="contract-reject-dialog">
          <p>
            Apenas usuários com contrato assinado podem utilizar o sistema. Você
            será deslogado.
          </p>
          <div className="contract-reject-actions">
            <Button type="button" onClick={handleConfirmReject}>
              Ok
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export default ContractModal;
