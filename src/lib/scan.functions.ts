import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAi, requireLovableApiKey } from "./ai-gateway.server";
import { firecrawlDeepScrape } from "./firecrawl.server";

const MODEL = "google/gemini-3-flash-preview";
const SOURCE_CONCURRENCY = 3;



interface SourceRow {
  id: string;
  name: string;
  url: string;
  description: string | null;
  keywords: string[];
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

interface LearningExamples {
  approved: { title: string; summary: string; source_name: string }[];
  rejected: { title: string; summary: string; source_name: string }[];
}

function renderExamples(ex: LearningExamples): string {
  if (!ex.approved.length && !ex.rejected.length) return "";
  const fmt = (arr: LearningExamples["approved"]) =>
    arr.map((d) => `- [${d.source_name}] ${d.title} — ${d.summary.slice(0, 140)}`).join("\n");
  let out = "\n\nAPRENDIZAGEM (decisões anteriores da editora Eliana — usa-as como referência forte do que é/não é relevante):\n";
  if (ex.approved.length) out += `\n✅ APROVADAS (exemplos do que QUERES detetar):\n${fmt(ex.approved)}\n`;
  if (ex.rejected.length) out += `\n❌ REJEITADAS (exemplos do que NÃO deves detetar — penaliza fortemente itens semelhantes):\n${fmt(ex.rejected)}\n`;
  return out;
}

async function scanOneSource(source: SourceRow, knownHashes: Set<string>, examples: LearningExamples) {
  const deep = await firecrawlDeepScrape(source.url, { maxPages: 1, perPageChars: 2500 });
  const content = deep.markdown.slice(0, 14000);
  if (!content) return { created: 0, error: null as string | null };

  const apiKey = requireLovableApiKey();
  const ai = createLovableAi(apiKey);

  // Janela temporal: últimos 90 dias
  const today = new Date();
  const cutoff = new Date(today.getTime() - 90 * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const { output } = await generateText({
    model: ai(MODEL),
    output: Output.object({
      schema: z.object({
        items: z.array(
          z.object({
            title: z.string(),
            summary: z.string(),
            source_url: z.string().nullable().optional(),
            published_at: z.string().nullable().optional(),
            relevance_score: z.coerce.number().min(0).max(100),
          }),
        ).default([]),
      }),
    }),
    system: `És um analista que monitoriza legislação e técnica para a SEPRI Group (medicina e segurança no trabalho em Portugal).
Recebes conteúdo bruto de uma fonte (pode incluir várias páginas concatenadas + uma lista de URLs candidatas) e devolves SÓ as novidades genuinamente RELEVANTES para os temas SEPRI:
medicina do trabalho, segurança no trabalho (SST), riscos psicossociais, autoproteção de edifícios e incêndios,
legionella, formação obrigatória, Lei 102/2009, Código do Trabalho, exames a trabalhadores expostos,
campanhas EU-OSHA, alterações climáticas e trabalho. Para a Ordem dos Psicólogos, APENAS Psicologia do Trabalho.
Ignora notícias institucionais genéricas, eventos sem impacto técnico, e tudo que seja off-topic.
JANELA TEMPORAL: considera APENAS itens publicados entre ${fmt(cutoff)} e ${fmt(today)} (últimos 90 dias). Se a data não estiver visível mas o contexto indicar que é recente (ex: ainda em vigor, agenda futura), inclui; se claramente for antigo, ignora.
Devolve até 8 itens. Se não houver nada relevante, devolve items: [].
published_at: data ISO (YYYY-MM-DD) se conseguires inferir, senão null.
relevance_score: 0-100 (100 = altamente crítico).

⚠️ REGRA CRÍTICA — source_url:
- Cada item TEM de ter a URL ESPECÍFICA da notícia/diploma/página, NUNCA a URL raiz da fonte (${source.url}).
- Procura a URL correta na lista de "URLs candidatas recentes/temáticas" ou nos links dentro do markdown (ex: em cabeçalhos [título](url), listas de notícias, "ler mais", "detalhe", etc.).
- Para o Diário da República, usa a URL de detalhe do diploma (ex: https://diariodarepublica.pt/dr/detalhe/...).
- Para o ACT, a URL da página temática específica (ex: https://portal.act.gov.pt/Pages/xxx.aspx).
- Se não conseguires identificar uma URL específica e concreta para o item, DEIXA source_url a null — nunca uses a URL raiz como preenchimento.${renderExamples(examples)}`,
    prompt: `Fonte: ${source.name}
URL raiz (NÃO usar como source_url de itens): ${source.url}
Palavras-chave de interesse: ${source.keywords.join(", ")}
Páginas analisadas: ${deep.pages}

Conteúdo (markdown, várias páginas + URLs candidatas):
---
${content}
---

Extrai novidades relevantes dos últimos 90 dias, cada uma com a sua URL específica.`,
  });

  const items = output.items
    .filter((i) => i.title && i.summary && i.relevance_score >= 40)
    .map((i) => {
      // Nunca aceitar a URL raiz da fonte como source_url do item.
      const url = i.source_url?.trim();
      const normalized =
        !url || url === source.url || url.replace(/\/$/, "") === source.url.replace(/\/$/, "")
          ? null
          : url;
      return { ...i, source_url: normalized };
    });

  // Fallback: para itens sem published_at, faz scrape rápido do source_url
  // e pede à IA para extrair APENAS a data de publicação.
  await Promise.all(
    items.map(async (item) => {
      if (item.published_at) return;
      const url = item.source_url ?? source.url;
      if (!url || url === source.url) return; // só vale a pena se for página específica
      try {
        const { firecrawlScrape } = await import("./firecrawl.server");
        const page = await firecrawlScrape(url, 150, 6000);
        const md = (page?.markdown ?? "").slice(0, 6000);
        if (!md) return;
        const { output: dateOut } = await generateText({
          model: ai(MODEL),
          output: Output.object({
            schema: z.object({ published_at: z.string().nullable() }),
          }),
          system: `Extrai a data de publicação da notícia/diploma a partir do conteúdo da página. Devolve YYYY-MM-DD ou null se mesmo não conseguires inferir. Procura por "Publicado em", "Data:", datas no formato DD/MM/AAAA, DD-MM-AAAA, ou referências como "1 de janeiro de 2025". Para diplomas do DRE usa a data do diploma.`,
          prompt: `Título: ${item.title}\nURL: ${url}\n\nConteúdo:\n${md}`,
        });
        if (dateOut.published_at && /^\d{4}-\d{2}-\d{2}$/.test(dateOut.published_at)) {
          item.published_at = dateOut.published_at;
        }
      } catch {
        /* ignora — fica null */
      }
    }),
  );

  const { createHash } = await import("crypto");
  const admin = await getAdmin();
  let created = 0;
  for (const item of items) {
    const hash = createHash("sha256")
      .update(`${source.id}:${item.title.toLowerCase().trim()}`)
      .digest("hex")
      .slice(0, 32);
    if (knownHashes.has(hash)) continue;
    const { error } = await admin.from("detections").insert({
      source_id: source.id,
      source_name: source.name,
      title: item.title,
      summary: item.summary,
      source_url: item.source_url ?? source.url,
      content_hash: hash,
      relevance_score: item.relevance_score,
      published_at: item.published_at ?? null,
    });
    if (!error) {
      created++;
      knownHashes.add(hash);
    }
  }
  return { created, error: null };
}

async function sendAlertEmail(
  to: string,
  detection: { id: string; title: string; summary: string; source_name: string; source_url: string | null },
  origin: string,
) {
  const { buildApprovalUrls } = await import("./tokens.server");
  const { approveUrl, rejectUrl } = buildApprovalUrls(origin, detection.id);
  // Try Brevo connector if available; otherwise log.
  const lovableKey = process.env.LOVABLE_API_KEY;
  const brevoKey = process.env.BREVO_API_KEY;
  if (!lovableKey || !brevoKey) {
    console.warn("[alert] Brevo não conectado — alerta apenas registado:", {
      to,
      detection_id: detection.id,
      approveUrl,
      rejectUrl,
    });
    return { sent: false, approveUrl, rejectUrl };
  }
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
    <h2 style="color:#0f5e8f;">Nova deteção SEPRI</h2>
    <p style="font-size:13px;color:#64748b;margin:0 0 4px;">Fonte: <strong>${detection.source_name}</strong></p>
    <h3 style="margin:8px 0 4px;">${escapeHtml(detection.title)}</h3>
    <p style="line-height:1.5;">${escapeHtml(detection.summary)}</p>
    ${detection.source_url ? `<p style="font-size:13px;"><a href="${detection.source_url}">Ver fonte original →</a></p>` : ""}
    <p style="margin:24px 0 8px;font-weight:600;">É relevante avançar com a criação da newsletter?</p>
    <p>
      <a href="${approveUrl}" style="background:#0f5e8f;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-right:8px;">✅ Aprovar</a>
      <a href="${rejectUrl}" style="background:#e2e8f0;color:#0f172a;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;">❌ Rejeitar</a>
    </p>
    <p style="font-size:11px;color:#94a3b8;margin-top:24px;">Token válido por 14 dias. Após aprovação, a newsletter é gerada automaticamente e fica disponível no dashboard SEPRI.</p>
  </div>`;
  try {
    const r = await fetch("https://connector-gateway.lovable.dev/brevo/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": brevoKey,
      },
      body: JSON.stringify({
        sender: { name: "SEPRI Newsletter Bot", email: "no-reply@sepri.pt" },
        to: [{ email: to }],
        subject: `[SEPRI] ${detection.source_name}: ${detection.title}`,
        htmlContent: html,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error("Brevo send failed", r.status, t);
      return { sent: false, approveUrl, rejectUrl, error: `Brevo ${r.status}` };
    }
    return { sent: true, approveUrl, rejectUrl };
  } catch (e) {
    console.error("Brevo send error", e);
    return { sent: false, approveUrl, rejectUrl, error: String(e) };
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
) {
  const results: R[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const current = cursor++;
      results[current] = await mapper(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function runScan(origin: string, triggeredBy: "cron" | "manual") {
  const admin = await getAdmin();
  const run = await admin
    .from("scan_runs")
    .insert({ triggered_by: triggeredBy })
    .select("id")
    .single();
  if (run.error) throw new Error(run.error.message);
  const runId = run.data.id;

  const { data: sources } = await admin
    .from("sources")
    .select("id,name,url,description,keywords")
    .eq("active", true);
  // Dedupe contra TODO o histórico de deteções (qualquer estado, qualquer data)
  // — garante que itens já vistos, aprovados, rejeitados ou já usados em
  // newsletters não voltam a gerar alerta.
  const { data: known } = await admin
    .from("detections")
    .select("content_hash");
  const knownHashes = new Set((known ?? []).map((r) => r.content_hash));

  const { data: config } = await admin
    .from("app_config")
    .select("alert_email")
    .eq("id", 1)
    .single();
  const alertEmail = config?.alert_email ?? "joanicapereira@gmail.com";

  // Carrega exemplos de aprendizagem: últimas decisões da Eliana
  const [{ data: approvedRows }, { data: rejectedRows }] = await Promise.all([
    admin
      .from("detections")
      .select("title,summary,source_name")
      .in("status", ["informativo", "prioritario"])
      .order("decided_at", { ascending: false })
      .limit(15),
    admin
      .from("detections")
      .select("title,summary,source_name")
      .eq("status", "rejected")
      .order("decided_at", { ascending: false })
      .limit(15),
  ]);
  const examples: LearningExamples = {
    approved: approvedRows ?? [],
    rejected: rejectedRows ?? [],
  };

  const errors: { source: string; error: string }[] = [];
  let totalCreated = 0;
  let scanned = 0;
  // Scan with bounded concurrency to avoid API/backend contention.
  const results = await mapWithConcurrency((sources ?? []) as SourceRow[], SOURCE_CONCURRENCY, async (src) => {
      try {
        const res = await scanOneSource(src, knownHashes, examples);
        return { ok: true as const, created: res.created };
      } catch (e) {
        return { ok: false as const, source: src.name, error: String((e as Error).message ?? e) };
      }
    });
  for (const r of results) {
    if (r.ok) {
      totalCreated += r.created;
      scanned++;
    } else {
      errors.push({ source: r.source, error: r.error });
    }
  }

  // Send alert emails in parallel too


  // Send alerts for new pending detections from this run
  const { data: newPending } = await admin
    .from("detections")
    .select("id,title,summary,source_name,source_url")
    .eq("status", "pending")
    .gte("detected_at", new Date(Date.now() - 5 * 60_000).toISOString())
    .order("relevance_score", { ascending: false })
    .limit(20);
  await Promise.all((newPending ?? []).map((d) => sendAlertEmail(alertEmail, d, origin)));

  await admin
    .from("scan_runs")
    .update({
      finished_at: new Date().toISOString(),
      sources_scanned: scanned,
      detections_created: totalCreated,
      errors: errors,
    })
    .eq("id", runId);

  // Email-resumo do scan (apenas para scans automáticos diários)
  if (triggeredBy === "cron") {
    await sendScanSummaryEmail(alertEmail, {
      scanned,
      created: totalCreated,
      errors,
      detections: newPending ?? [],
      origin,
    });
  }

  return { runId, scanned, created: totalCreated, errors };
}

async function sendScanSummaryEmail(
  to: string,
  data: {
    scanned: number;
    created: number;
    errors: { source: string; error: string }[];
    detections: { id: string; title: string; summary: string; source_name: string; source_url: string | null }[];
    origin: string;
  },
) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const brevoKey = process.env.BREVO_API_KEY;
  if (!lovableKey || !brevoKey) {
    console.warn("[scan-summary] Brevo não conectado — resumo apenas registado", {
      to,
      scanned: data.scanned,
      created: data.created,
    });
    return;
  }
  const today = new Date().toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });
  const inboxUrl = `${data.origin}/inbox`;
  const detectionsHtml = data.detections.length
    ? data.detections
        .map(
          (d) => `<li style="margin:0 0 12px;">
            <strong>${escapeHtml(d.title)}</strong><br/>
            <span style="font-size:12px;color:#64748b;">${escapeHtml(d.source_name)}</span><br/>
            <span style="font-size:13px;color:#334155;">${escapeHtml(d.summary)}</span>
            ${d.source_url ? `<br/><a href="${d.source_url}" style="font-size:12px;color:#0f5e8f;">Ver fonte →</a>` : ""}
          </li>`,
        )
        .join("")
    : `<li style="color:#64748b;">Sem novas deteções relevantes hoje.</li>`;
  const errorsHtml = data.errors.length
    ? `<p style="margin:16px 0 4px;font-weight:600;color:#b91c1c;">Erros (${data.errors.length}):</p>
       <ul style="padding-left:18px;color:#b91c1c;font-size:13px;">${data.errors
         .map((e) => `<li>${escapeHtml(e.source)}: ${escapeHtml(e.error)}</li>`)
         .join("")}</ul>`
    : "";

  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">
    <h2 style="color:#0f5e8f;margin:0 0 4px;">Resumo do scan diário SEPRI</h2>
    <p style="margin:0 0 16px;color:#64748b;font-size:13px;">${today}</p>
    <table style="border-collapse:collapse;margin:0 0 16px;">
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Fontes analisadas:</td><td style="font-weight:600;">${data.scanned}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Novas deteções:</td><td style="font-weight:600;">${data.created}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Erros:</td><td style="font-weight:600;">${data.errors.length}</td></tr>
    </table>
    <h3 style="margin:16px 0 8px;">Deteções desta execução</h3>
    <ul style="padding-left:18px;">${detectionsHtml}</ul>
    ${errorsHtml}
    <p style="margin:24px 0 8px;">
      <a href="${inboxUrl}" style="background:#0f5e8f;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block;">Abrir caixa de entrada</a>
    </p>
    <p style="font-size:11px;color:#94a3b8;margin-top:24px;">Scan automático SEPRI · executado diariamente às 07:00 (Lisboa).</p>
  </div>`;

  try {
    const r = await fetch("https://connector-gateway.lovable.dev/brevo/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": brevoKey,
      },
      body: JSON.stringify({
        sender: { name: "SEPRI Newsletter Bot", email: "no-reply@sepri.pt" },
        to: [{ email: to }],
        subject: `[SEPRI] Resumo do scan diário — ${data.created} nova(s) deteção(ões)`,
        htmlContent: html,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error("Brevo summary send failed", r.status, t);
    }
  } catch (e) {
    console.error("Brevo summary send error", e);
  }
}

export const triggerManualScan = createServerFn({ method: "POST" }).handler(async () => {
  const { getRequestHost } = await import("@tanstack/react-start/server");
  const host = getRequestHost();
  const origin = `https://${host}`;
  return runScan(origin, "manual");
});
