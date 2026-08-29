import nodemailer from "nodemailer";

export type SendEmailResult = { ok: true } | { ok: false; reason: string };

let cachedTransport: ReturnType<typeof nodemailer.createTransport> | null = null;

/**
 * Lê a configuração SMTP das secrets. Para Gmail: SMTP_HOST=smtp.gmail.com,
 * SMTP_PORT=465, SMTP_USER=oteuemail@gmail.com, SMTP_PASS=palavra-passe de
 * aplicação (não a palavra-passe normal da conta — gera uma em
 * https://myaccount.google.com/apppasswords).
 */
function getTransport() {
  if (cachedTransport) return cachedTransport;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return cachedTransport;
}

export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<SendEmailResult> {
  const transport = getTransport();
  if (!transport) {
    return {
      ok: false,
      reason:
        "SMTP não configurado — em falta uma ou mais de: SMTP_HOST, SMTP_USER, SMTP_PASS nas secrets do projeto.",
    };
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
  try {
    await transport.sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String((e as Error).message ?? e) };
  }
}
