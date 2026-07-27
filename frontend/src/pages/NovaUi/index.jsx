import { useState } from "react";
import { Button } from "../../components";
import melPetLogo from "../MelPetHostel/assets/MelPetHostel_Logo.jpeg";
import "./styles.css";

const tutorContext = {
  tutor: "Carolina Reis",
  pet: "Nina",
  phone: "(11) 98888-1020",
  status: "Atendimento ativo",
};

const accordionSections = [
  {
    id: "acesso",
    title: "Acesso do usuario",
    summary: "Login, senha, perfil e status do acesso.",
    action: "Editar acesso",
    fields: [
      ["Login", "carolina.reis"],
      ["Perfil", "Usuario"],
      ["Status", "Ativo"],
      ["Sessao", "Expiracao automatica"],
    ],
  },
  {
    id: "tutor",
    title: "Dados cadastrais do tutor",
    summary: "Informacoes pessoais, contatos e endereco.",
    action: "Editar tutor",
    fields: [
      ["Nome", "Carolina Reis"],
      ["CPF", "123.456.789-00"],
      ["Telefone", "(11) 98888-1020"],
      ["E-mail", "carolina@email.com"],
      ["Endereco", "Rua das Flores, 120 - Sao Paulo"],
    ],
  },
  {
    id: "pets",
    title: "Pets cadastrados",
    summary: "Um tutor pode ter um ou mais pets vinculados.",
    action: "Adicionar pet",
    items: [
      ["Nina", "Spitz, 4 anos, evitar grupo grande no primeiro contato."],
      ["Bento", "SRD, 2 anos, racao propria duas vezes ao dia."],
    ],
  },
  {
    id: "documentos",
    title: "Documentos do pet",
    summary: "Vacinas, contrato, anamnese e anexos.",
    action: "Anexar documento",
    items: [
      ["Contrato", "Aguardando assinatura"],
      ["Carteira de vacinacao", "Pendente revisao"],
      ["Ficha de anamnese", "Completa"],
    ],
  },
  {
    id: "presenca",
    title: "Controle de presenca",
    summary: "Entradas, saidas, day care e hospedagens.",
    action: "Registrar presenca",
    items: [
      ["Hoje", "Day care - entrada 08:20, saida prevista 18:00"],
      ["23/07", "Hospedagem - suite 05"],
      ["22/07", "Check-out realizado as 17:30"],
    ],
  },
  {
    id: "pagamentos",
    title: "Controle de pagamentos",
    summary: "Lancamentos, recebimentos, pendencias e comprovantes.",
    action: "Lancar pagamento",
    items: [
      ["Mensalidade day care", "Pago - R$ 680,00"],
      ["Hospedagem fim de semana", "Pendente - R$ 240,00"],
    ],
  },
  {
    id: "relatorios",
    title: "Relatorios",
    summary: "Frequencia, pagamentos, historico e pendencias.",
    action: "Gerar relatorio",
    items: [
      ["Frequencia", "14 presencas no periodo"],
      ["Pagamentos", "1 pendencia financeira"],
      ["Documentos", "2 documentos aguardando conferencia"],
    ],
  },
];

function AccordionPanel({ section, isOpen, onToggle }) {
  return (
    <section className={`accordion-section ${isOpen ? "is-open" : ""}`}>
      <button
        className="accordion-trigger"
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`accordion-panel-${section.id}`}
      >
        <span>
          <strong>{section.title}</strong>
          <small>{section.summary}</small>
        </span>
        <em>{isOpen ? "Fechar" : "Abrir"}</em>
      </button>

      {isOpen ? (
        <div className="accordion-content" id={`accordion-panel-${section.id}`}>
          {section.fields ? (
            <div className="accordion-fields">
              {section.fields.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          ) : null}

          {section.items ? (
            <div className="accordion-list">
              {section.items.map(([title, description]) => (
                <article key={title}>
                  <strong>{title}</strong>
                  <span>{description}</span>
                </article>
              ))}
            </div>
          ) : null}

          <Button type="button" size="small">
            {section.action}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function NovaUi({ onBack }) {
  const [openSectionId, setOpenSectionId] = useState(accordionSections[0].id);

  return (
    <main className="accordion-ui-page">
      <header className="accordion-ui-header">
        <div className="accordion-ui-brand">
          <img src={melPetLogo} alt="Mel Pet Hostel" />
          <div>
            <span>Nova UI</span>
            <strong>Modelo Accordion</strong>
          </div>
        </div>

        <Button type="button" variant="outline" onClick={onBack}>
          Voltar
        </Button>
      </header>

      <section className="accordion-ui-intro">
        <span>Atendimento simples</span>
        <h1>Abra somente a parte que precisa usar.</h1>
        <p>
          Este formato evita muitos cards na tela. O usuario busca o tutor ou pet
          e abre uma secao por vez: acesso, tutor, pets, documentos, presenca,
          pagamentos ou relatorios.
        </p>
      </section>

      <section className="accordion-search" role="search">
        <input type="search" placeholder="Buscar tutor, pet ou telefone" />
        <Button type="button">Buscar</Button>
      </section>

      <section className="accordion-context" aria-label="Atendimento selecionado">
        <div>
          <span>Tutor</span>
          <strong>{tutorContext.tutor}</strong>
        </div>
        <div>
          <span>Pet</span>
          <strong>{tutorContext.pet}</strong>
        </div>
        <div>
          <span>Telefone</span>
          <strong>{tutorContext.phone}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{tutorContext.status}</strong>
        </div>
      </section>

      <section className="accordion-shell" aria-label="Areas do sistema">
        {accordionSections.map((section) => (
          <AccordionPanel
            isOpen={openSectionId === section.id}
            key={section.id}
            section={section}
            onToggle={() =>
              setOpenSectionId((currentId) => (currentId === section.id ? "" : section.id))
            }
          />
        ))}
      </section>
    </main>
  );
}

export default NovaUi;
