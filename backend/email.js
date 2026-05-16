const nodemailer = require("nodemailer");

function emailReady() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.ALERT_TO);
}

function getTransporter() {
  if (!emailReady()) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function sendMail({ subject, text, attachments = [] }) {
  const transporter = getTransporter();
  if (!transporter) return { sent: false, reason: "Email non configuré. Vérifier le fichier .env." };
  const info = await transporter.sendMail({
    from: `"PFA Dosage Peinture" <${process.env.SMTP_USER}>`,
    to: process.env.ALERT_TO,
    subject,
    text,
    attachments
  });
  return { sent: true, messageId: info.messageId };
}

module.exports = { sendMail, emailReady };
