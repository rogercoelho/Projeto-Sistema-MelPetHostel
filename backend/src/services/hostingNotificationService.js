const { sendEmail } = require("./emailService");

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function formatEmailDate(value) {
  if (!value) return "data nao informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return clean(value) || "data nao informada";
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function getPetGenderArticle(request) {
  const pet = (request?.itens || [])[0] || {};
  const gender = clean(pet.sexo || pet.genero || pet.gender)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return gender.startsWith("f") ? "da pequena" : "do pequeno";
}

function buildPendingPaymentReminder({ tutorName, pets }) {
  return `Ola ${clean(tutorName) || "tutor(a)"}, tudo bem!?

A estadia solicitada para ${clean(pets) || "seu pet"} ainda esta pendente de pagamento. Se efetuou o pagamento, nao esqueca de enviar o comprovante pelo portal da Mel Pet Hostel.

Lembre-se que a estadia so e liberada apos o pagamento.

Qualquer duvida, estamos a disposicao.

Equipe Mel Pet Hostel.`;
}

function buildPaymentLinkEmail({ request, linkPagamento }) {
  const petName = clean((request?.itens || [])[0]?.petNome) || "pet";
  return `Ola ${clean(request?.clienteNome) || "Tutor"},

Para a estadia ${getPetGenderArticle(request)} ${petName}, o modo de pagamento selecionado foi via cartao de credito.
Geramos o link de pagamento abaixo:
${clean(linkPagamento)}

Para pagamentos realizados por cartao de credito, juros, encargos e taxas administrativas de eventuais parcelamentos serao de responsabilidade do cliente.

Caso queira, voce tambem pode acessar o sistema da Mel Pet Hostel para confirmar o link de pagamento ou mudar a opcao de pagamento.
Obrigado por escolher os servicos da Mel Pet Hostel.`;
}

function buildApprovalEmail(request) {
  return `Ola ${clean(request?.clienteNome) || "Tutor"},

O seu pedido de ${clean(request?.tipo) || "hospedagem"} para ${formatEmailDate(request?.dataEntrada)} ate ${formatEmailDate(request?.dataSaida)} foi analisado e aprovado.
Para confirmar a sua reserva, acesse o sistema da Mel Pet Hostel, efetue o processo de pagamento e nos envie o comprovante.
Lembrando que a estadia so sera liberada apos a comprovacao dos pagamentos.
Muito obrigado por escolher a Mel Pet Hostel.`;
}

function buildMonthlyInvoiceReleaseMessage({ request, competencia, valor, formatMonth, formatMoney }) {
  const pets = (request?.itens || []).map((item) => clean(item.petNome)).filter(Boolean);
  const petsLabel = pets.length ? pets.join(", ") : "-";
  const monthLabel = formatMonth(competencia);
  const valueLabel = formatMoney(valor);
  const presenceReference = pets.length > 1
    ? "dos pequenos"
    : getPetGenderArticle(request) === "da pequena"
      ? "da sua pequena"
      : "do seu pequeno";

  return `Ola ${clean(request?.clienteNome) || "tutor(a)"}, tudo bem!?

A fatura mensal ja esta disponivel para pagamento.

Segue o resumo:
Tutor: ${clean(request?.clienteNome) || "-"}
Ciclo: ${monthLabel}
Pets: ${petsLabel}
Total: ${valueLabel}

Acesse o portal para escolher a forma de pagamento e para mais detalhes sobre as presencas ${presenceReference}.

Se tiver qualquer duvida, estamos a disposicao!
Equipe Mel Pet Hostel!`;
}

function sendHostingPaymentLinkEmail(request, linkPagamento) {
  return sendEmail({
    to: request?.clienteEmail,
    subject: "Link de Pagamento - Mel Pet Hostel",
    text: buildPaymentLinkEmail({ request, linkPagamento }),
  });
}

function sendHostingApprovalEmail(request) {
  return sendEmail({
    to: request?.clienteEmail,
    subject: "Confirmacao do seu Pedido de Hospedagem - Mel Pet Hostel",
    text: buildApprovalEmail(request),
  });
}

function sendMonthlyInvoiceReleaseEmail({ request, competencia, valor, formatMonth, formatMoney }) {
  return sendEmail({
    to: request?.clienteEmail,
    subject: `Fatura mensal disponivel - ${formatMonth(competencia)} | Mel Pet Hostel`,
    text: buildMonthlyInvoiceReleaseMessage({ request, competencia, valor, formatMonth, formatMoney }),
  });
}

function sendPendingPaymentReminder({ tutorEmail, tutorName, pets }) {
  return sendEmail({
    to: tutorEmail,
    subject: "Lembrete de pagamento pendente - Mel Pet Hostel",
    text: buildPendingPaymentReminder({ tutorName, pets }),
  });
}

module.exports = {
  buildMonthlyInvoiceReleaseMessage,
  sendHostingApprovalEmail,
  sendHostingPaymentLinkEmail,
  sendMonthlyInvoiceReleaseEmail,
  sendPendingPaymentReminder,
};