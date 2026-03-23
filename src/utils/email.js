import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env;
  if (!EMAIL_USER || !EMAIL_PASS) {
    return null;
  }
  transporter = nodemailer.createTransport({
    host: EMAIL_HOST || 'smtp.gmail.com',
    port: Number(EMAIL_PORT) || 587,
    secure: false,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
  return transporter;
}

/**
 * Sends email if SMTP is configured; otherwise logs in development.
 */
export async function sendMail({ to, subject, html, text }) {
  const t = getTransporter();
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  if (!t || !from) {
    console.log('[email skipped — configure EMAIL_*]', { to, subject, text: text?.slice?.(0, 80) });
    return { skipped: true };
  }
  await t.sendMail({ from, to, subject, html, text });
  return { sent: true };
}
