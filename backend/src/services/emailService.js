const nodemailer = require("nodemailer");

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function getEmailConfig() {
  const port = Number(process.env.SMTP_PORT || 587);
  const secureValue = clean(process.env.SMTP_SECURE).toLowerCase();
  return {
    host: clean(process.env.SMTP_HOST),
    port,
    secure: secureValue === "true" || secureValue === "1" || port === 465,
    user: clean(process.env.SMTP_USER),
    pass: clean(process.env.SMTP_PASS),
    from: clean(process.env.SMTP_FROM),
  };
}

function validateEmailConfig(config) {
  if (!config.host) return "smtp_host_nao_configurado";
  if (!config.user) return "smtp_usuario_nao_configurado";
  if (!config.pass) return "smtp_senha_nao_configurada";
  return "";
}

function createTransporter(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

async function sendEmail({ to, subject, text }) {
  const recipient = clean(to);
  if (!recipient) return { sent: false, reason: "email_nao_informado" };

  const config = getEmailConfig();
  const configError = validateEmailConfig(config);
  if (configError) return { sent: false, reason: configError };

  const from = config.from || config.user;
  await createTransporter(config).sendMail({ from, to: recipient, subject, text });
  return { sent: true, to: recipient };
}

module.exports = { sendEmail };