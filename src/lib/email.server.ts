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

/** Separa uma lista de emails por vírgula, ponto e vírgula ou espaços/linhas. */
export function parseRecipients(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\s]+/)) {
    const e = part.trim();
    if (!e) continue;
    const k = e.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

// Secret opcional RESEND_API_KEYS: "email1=re_xxx,email2=re_yyy". Permite que,
// sem domínio verificado, cada destinatário use a key da sua própria conta
// Resend (o plano gratuito só envia para o email do dono da conta).
function keyFor(email: string): string | undefined {
  const map = process.env.RESEND_API_KEYS;
  if (map) {
    for (const pair of map.split(",")) {
      const idx = pair.indexOf("=");
      if (idx < 0) continue;
      if (pair.slice(0, idx).trim().toLowerCase() === email.toLowerCase()) {
        const k = pair.slice(idx + 1).trim();
        if (k) return k;
      }
    }
  }
  return process.env.RESEND_API_KEY;
}

async function sendOne(to: string, subject: string, html: string): Promise<SendEmailResult> {
  const apiKey = keyFor(to);
  if (!apiKey) {
    return { ok: false, reason: "RESEND_API_KEY em falta nas secrets do projeto." };
  }
  const from = process.env.RESEND_FROM || "SEPRI Legal Monitor <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to: [to], subject, html }),
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

/** `to` pode ter vários emails separados por vírgula. Um envio por destinatário. */
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<SendEmailResult> {
  const recipients = parseRecipients(opts.to);
  if (recipients.length === 0) return { ok: false, reason: "Sem destinatários configurados." };
  const results = await Promise.all(recipients.map((r) => sendOne(r, opts.subject, opts.html)));
  const failures = results
    .map((r, i) => (r.ok ? null : `${recipients[i]}: ${r.reason}`))
    .filter((x): x is string => !!x);
  if (failures.length === results.length) return { ok: false, reason: failures.join(" | ") };
  if (failures.length) console.error("[email] falhas parciais:", failures.join(" | "));
  return { ok: true };
}
