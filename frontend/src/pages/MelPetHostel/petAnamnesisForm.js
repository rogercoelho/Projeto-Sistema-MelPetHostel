export const YES_NO_OPTIONS = ["Sim", "Não"];
export const YES_NO_UNKNOWN_OPTIONS = ["Sim", "Não", "Não sei"];

const veracityText =
  "Declaro que todas as informações prestadas nesta Ficha de Anamnese Pet são verdadeiras, completas e atualizadas, assumindo plena responsabilidade civil e legal pelas informações aqui declaradas.";

export function getEmptyPetAnamnesisForm() {
  return {
    nomePet: "",
    raca: "",
    idade: "",
    pesoAproximado: "",
    veterinarioNome: "",
    clinicaNome: "",
    clinicaTelefone: "",
    clinicaEndereco: "",
    autorizaAtendimentoEmergencial: "",
    autorizaMedicacao: "",
    sexo: "",
    castrado: "",
    doencaDiagnosticada: "",
    doencaDetalhes: "",
    cirurgiasHistorico: "",
    cirurgiasDetalhes: "",
    medicamentoContinuo: "",
    medicamentoDetalhes: "",
    alimentacaoTipos: [],
    alimentacaoMarca: "",
    alimentacaoQuantidadeHorarios: "",
    restricoesAlimentares: "",
    deixaMexerPotinho: "",
    petiscos: "",
    comportamentoCaes: "",
    agressividade: "",
    agressividadeSituacoes: "",
    destroiObjetos: "",
    ansiedadeSeparacao: "",
    medosEspecificos: "",
    reacaoMedo: "",
    comoAcalmar: "",
    ficaSozinho: "",
    tempoSozinho: "",
    localDormir: "",
    ritualDormirComer: "",
    aceitaBanhoEscovacao: "",
    aceitaRoupinha: "",
    permiteManuseio: "",
    gostaColo: "",
    sensibilidadeFisica: "",
    sensibilidadeDetalhes: "",
    brincaPiscina: "",
    brincaMangueira: "",
    brincaBolinha: "",
    brincaMadeira: "",
    observacoesTutor: "",
    veracidadeInformacoes: false,
  };
}

export const PET_ANAMNESIS_SECTIONS = [
  {
    number: "2",
    title: "Dados do pet",
    description: "Identificação básica para individualizar os cuidados.",
    fields: [
      {
        name: "nomePet",
        label: "Nome do pet",
        type: "text",
        required: true,
      },
      { name: "raca", label: "Raça", type: "text", required: true },
      { name: "idade", label: "Idade", type: "text", required: true },
      {
        name: "pesoAproximado",
        label: "Peso aproximado",
        type: "text",
        required: true,
        placeholder: "Ex.: 12 kg",
      },
    ],
  },
  {
    number: "3",
    title: "Informações veterinárias",
    description:
      "Contatos de referência para qualquer necessidade clínica durante a permanência.",
    fields: [
      {
        name: "veterinarioNome",
        label: "Nome do veterinário",
        type: "text",
        required: true,
      },
      {
        name: "clinicaNome",
        label: "Nome da clínica veterinária",
        type: "text",
        required: true,
      },
      {
        name: "clinicaTelefone",
        label: "Telefone da clínica veterinária",
        type: "tel",
        required: true,
      },
      {
        name: "clinicaEndereco",
        label: "Endereço da clínica veterinária",
        type: "textarea",
        required: true,
        wide: true,
      },
    ],
  },
  {
    number: "4",
    title: "Autorizações importantes",
    description:
      "Autorizações prévias para decisões de cuidado quando houver necessidade.",
    fields: [
      {
        name: "autorizaAtendimentoEmergencial",
        label:
          "Você autoriza atendimento veterinário emergencial com profissional de nossa confiança, caso seu veterinário cadastrado não atenda o contato?",
        type: "radio",
        options: YES_NO_OPTIONS,
        required: true,
        wide: true,
      },
      {
        name: "autorizaMedicacao",
        label:
          "Você autoriza a administração de medicamentos conforme orientação do tutor/veterinário?",
        type: "radio",
        options: YES_NO_OPTIONS,
        required: true,
        wide: true,
      },
    ],
  },
  {
    number: "5",
    title: "Saúde",
    description:
      "Histórico de saúde, medicações e informações essenciais para manejo seguro.",
    fields: [
      {
        name: "sexo",
        label: "Sexo",
        type: "radio",
        options: ["Macho", "Fêmea"],
        required: true,
      },
      {
        name: "castrado",
        label: "Seu pet é castrado?",
        type: "radio",
        options: YES_NO_OPTIONS,
        required: true,
      },
      {
        name: "doencaDiagnosticada",
        label: "Seu pet possui alguma doença diagnosticada?",
        type: "radio",
        options: YES_NO_OPTIONS,
        required: true,
        wide: true,
      },
      {
        name: "doencaDetalhes",
        label: "Em caso positivo, quais?",
        type: "textarea",
        wide: true,
      },
      {
        name: "cirurgiasHistorico",
        label: "Seu pet possui histórico de cirurgias?",
        type: "radio",
        options: YES_NO_OPTIONS,
        required: true,
        wide: true,
      },
      {
        name: "cirurgiasDetalhes",
        label: "Em caso positivo, quais?",
        type: "textarea",
        wide: true,
      },
      {
        name: "medicamentoContinuo",
        label: "Seu pet faz uso contínuo de medicamentos?",
        type: "radio",
        options: YES_NO_OPTIONS,
        required: true,
        wide: true,
      },
      {
        name: "medicamentoDetalhes",
        label: "Em caso positivo, discrimine medicações, dosagens e horários",
        type: "textarea",
        wide: true,
      },
    ],
  },
  {
    number: "6",
    title: "Alimentação",
    description:
      "Rotina alimentar para manter o pet próximo aos hábitos de casa.",
    fields: [
      {
        name: "alimentacaoTipos",
        label: "Qual tipo de alimentação é oferecida para seu pet?",
        type: "checkboxGroup",
        options: [
          "Ração seca",
          "Ração úmida",
          "Alimentação natural",
          "Alimentação mista",
        ],
        required: true,
        wide: true,
      },
      {
        name: "alimentacaoMarca",
        label: "Marca da ração / alimento oferecido",
        type: "text",
        required: true,
        wide: true,
      },
      {
        name: "alimentacaoQuantidadeHorarios",
        label: "Quantidade oferecida e horários",
        type: "textarea",
        required: true,
        wide: true,
      },
      {
        name: "restricoesAlimentares",
        label: "Restrições alimentares ou alergias. Quais?",
        type: "textarea",
        required: true,
        wide: true,
      },
      {
        name: "deixaMexerPotinho",
        label: "Seu pet deixa mexer no potinho enquanto está comendo?",
        type: "radio",
        options: YES_NO_OPTIONS,
        required: true,
        wide: true,
      },
      {
        name: "petiscos",
        label: "Seu pet pode receber petiscos?",
        type: "radio",
        options: [
          "Sim, somente naturais",
          "Sim, naturais e industrializados",
          "Não",
        ],
        required: true,
        wide: true,
      },
    ],
  },
  {
    number: "7",
    title: "Comportamento",
    description:
      "Detalhes sobre sociabilidade, medos e reações para preservar saúde física e mental.",
    fields: [
      {
        name: "comportamentoCaes",
        label: "Como seu pet se comporta com outros cães?",
        type: "radio",
        options: ["Sociável", "Tímido", "Dominante", "Reativo"],
        required: true,
        wide: true,
      },
      {
        name: "agressividade",
        label:
          "Seu pet já apresentou agressividade com outros pets e/ou tutores/cuidadores?",
        type: "radio",
        options: YES_NO_OPTIONS,
        required: true,
        wide: true,
      },
      {
        name: "agressividadeSituacoes",
        label: "Em caso positivo, em quais situações?",
        type: "textarea",
        wide: true,
      },
      {
        name: "destroiObjetos",
        label: "Seu pet costuma destruir objetos?",
        type: "radio",
        options: YES_NO_UNKNOWN_OPTIONS,
        required: true,
        wide: true,
      },
      {
        name: "ansiedadeSeparacao",
        label: "Seu pet sofre de ansiedade de separação?",
        type: "radio",
        options: YES_NO_OPTIONS,
        required: true,
        wide: true,
      },
      {
        name: "medosEspecificos",
        label:
          "Seu pet tem medo de algo específico? Ex.: trovão, chuva, fogos, barulho de moto",
        type: "textarea",
        required: true,
        wide: true,
      },
      {
        name: "reacaoMedo",
        label:
          "Qual é a reação do seu pet em caso de medo? Ex.: se esconde, pula, foge, fica ofegante, treme",
        type: "textarea",
        required: true,
        wide: true,
      },
      {
        name: "comoAcalmar",
        label: "Como você o acalma em cada caso?",
        type: "textarea",
        required: true,
        wide: true,
      },
    ],
  },
  {
    number: "8",
    title: "Rotina e hábitos",
    description:
      "Hábitos do dia a dia para facilitar a adaptação do pet ao espaço.",
    fields: [
      {
        name: "ficaSozinho",
        label: "Seu pet costuma ficar sozinho em casa?",
        type: "radio",
        options: YES_NO_OPTIONS,
        required: true,
        wide: true,
      },
      {
        name: "tempoSozinho",
        label: "Em caso positivo, por quanto tempo?",
        type: "text",
      },
      {
        name: "localDormir",
        label: "Onde seu pet costuma dormir?",
        type: "text",
        required: true,
        placeholder: "Cama, sofá, chão, caixinha, com os tutores...",
        wide: true,
      },
      {
        name: "ritualDormirComer",
        label: "Você faz algum ritual para dormir ou comer?",
        type: "textarea",
        required: true,
        wide: true,
      },
    ],
  },
  {
    number: "9",
    title: "Higiene e manuseio",
    description:
      "Comportamento durante higiene, tratamento e contato físico.",
    fields: [
      {
        name: "aceitaBanhoEscovacao",
        label: "Seu pet aceita banho e escovação?",
        type: "radio",
        options: YES_NO_UNKNOWN_OPTIONS,
        required: true,
        wide: true,
      },
      {
        name: "aceitaRoupinha",
        label: "Seu pet aceita colocar e tirar a roupinha?",
        type: "radio",
        options: YES_NO_UNKNOWN_OPTIONS,
        required: true,
        wide: true,
      },
      {
        name: "permiteManuseio",
        label: "Seu pet permite manuseio das patas, orelhas e boca?",
        type: "radio",
        options: YES_NO_UNKNOWN_OPTIONS,
        required: true,
        wide: true,
      },
      {
        name: "gostaColo",
        label: "Seu pet gosta de ser pego no colo?",
        type: "radio",
        options: YES_NO_UNKNOWN_OPTIONS,
        required: true,
        wide: true,
      },
      {
        name: "sensibilidadeFisica",
        label: "Seu pet possui alguma sensibilidade física?",
        type: "radio",
        options: YES_NO_UNKNOWN_OPTIONS,
        required: true,
        wide: true,
      },
      {
        name: "sensibilidadeDetalhes",
        label: "Em caso positivo, qual?",
        type: "textarea",
        wide: true,
      },
    ],
  },
  {
    number: "10",
    title: "Brincadeiras",
    description:
      "Preferências de brincadeiras permitidas para uma permanência mais confortável.",
    fields: [
      {
        name: "brincaPiscina",
        label: "Seu pet gosta/pode brincar na piscina?",
        type: "radio",
        options: YES_NO_UNKNOWN_OPTIONS,
        required: true,
        wide: true,
      },
      {
        name: "brincaMangueira",
        label: "Seu pet gosta/pode brincar com água da mangueira?",
        type: "radio",
        options: YES_NO_UNKNOWN_OPTIONS,
        required: true,
        wide: true,
      },
      {
        name: "brincaBolinha",
        label: "Seu pet gosta/pode brincar com bolinha?",
        type: "radio",
        options: YES_NO_UNKNOWN_OPTIONS,
        required: true,
        wide: true,
      },
      {
        name: "brincaMadeira",
        label: "Seu pet gosta/pode brincar com brinquedos naturais de madeira?",
        type: "radio",
        options: YES_NO_UNKNOWN_OPTIONS,
        required: true,
        wide: true,
      },
    ],
  },
  {
    number: "11",
    title: "Observações importantes do tutor",
    description:
      "Informações complementares que ajudem a melhorar os cuidados, saúde e bem-estar.",
    fields: [
      {
        name: "observacoesTutor",
        label: "Observações importantes do tutor",
        type: "textarea",
        rows: 5,
        wide: true,
      },
    ],
  },
  {
    number: "12",
    title: "Veracidade das informações",
    description:
      "Confirmação de responsabilidade pelas informações preenchidas.",
    fields: [
      {
        name: "veracidadeInformacoes",
        label: veracityText,
        type: "checkbox",
        required: true,
        wide: true,
      },
    ],
  },
];

export function findMissingRequiredField(formData) {
  for (const section of PET_ANAMNESIS_SECTIONS) {
    for (const field of section.fields) {
      if (!field.required) continue;

      const value = formData[field.name];

      if (field.type === "checkboxGroup" && !value?.length) {
        return field.label;
      }

      if (field.type === "checkbox" && value !== true) {
        return field.label;
      }

      if (
        field.type !== "checkbox" &&
        field.type !== "checkboxGroup" &&
        String(value || "").trim() === ""
      ) {
        return field.label;
      }
    }
  }

  return "";
}
