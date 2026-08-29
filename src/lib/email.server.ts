// Envio de email via Resend (API HTTP com fetch — funciona em Cloudflare
// Workers, ao contrário de SMTP/nodemailer, que precisa de sockets TCP em
// bruto que o Workers não suporta).
//
// Configuração necessária (secrets do projeto):
// - RESEND_API_KEY: chave gerada em https://resend.com/api-keys
// - RESEND_FROM (opcional): remetente a usar. Sem domínio verificado no
//   Resend, usa "onboarding@resend.dev" (só permite enviar para o email da
//   própria conta Resend — suficiente para o alerta interno da Eliana).

export type SendEmailResult = { ok: true } | { ok: false; reason: string };

export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "RESEND_API_KEY em falta nas secrets do projeto." };
  }
  const from = process.env.RESEND_FROM || "onboarding@resend.dev";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, reason: `Resend devolveu erro ${res.status}: ${text.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String((e as Error).message ?? e) };
  }
}
