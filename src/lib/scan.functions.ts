import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createClaudeAi, requireAnthropicApiKey, FAST_MODEL } from "./ai-provider.server";
import { firecrawlDeepScrape, resolveUrlCandidatesForTitle, verifyArticleUrl } from "./web-scraper.server";

const MODEL = FAST_MODEL;
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
  if (!content) return { created: 0, dropped: [] as string[], error: null as string | null };

  const apiKey = requireAnthropicApiKey();
  const ai = createClaudeAi(apiKey);

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
- Cada item TEM de ter a URL ESPECÍFICA da notícia/diploma/página, NUNCA a URL raiz da fonte (${source.url}), e NUNCA uma página de listagem/índice de notícias.
- Procura a URL correta na lista de "URLs candidatas recentes/temáticas" ou nos links dentro do markdown (ex: em cabeçalhos [título](url), listas de notícias, "ler mais", "detalhe", etc.).
- Para o Diário da República, usa a URL de detalhe do diploma (ex: https://diariodarepublica.pt/dr/detalhe/...).
- Para o ACT, a URL da página temática específica (ex: https://portal.act.gov.pt/Pages/xxx.aspx).
- NUNCA inventes ou "adivinhes" uma URL que não vejas literalmente no conteúdo fornecido — só copia URLs que existem de facto na lista de candidatas ou nos links do markdown.
- Se não conseguires identificar uma URL específica e concreta para o item, DEIXA source_url a null — nunca uses a URL raiz nem uma URL inventada como preenchimento.${renderExamples(examples)}`,
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

  const rootNorm = source.url.replace(/\/$/, "");
  const rawItems = output.items.filter((i) => i.title && i.summary && i.relevance_score >= 40);

  const itemsWithCandidates = rawItems.map((i) => {
    const aiUrl = i.source_url?.trim();
    const aiIsUsable = !!aiUrl && aiUrl.replace(/\/$/, "") !== rootNorm;
    const fuzzyCandidates = resolveUrlCandidatesForTitle(i.title, deep.links, source.url, {
      minScore: 0.35,
      limit: 3,
    });
    const candidates = [...(aiIsUsable ? [aiUrl!] : []), ...fuzzyCandidates].filter(
      (u, idx, arr) => arr.indexOf(u) === idx,
    );
    return { ...i, candidates };
  });

  const items = await Promise.all(
    itemsWithCandidates.map(async (item) => {
      let validUrl: string | null = null;
      for (const candidate of item.candidates) {
        const verified = await verifyArticleUrl(candidate, item.title);
        if (verified) {
          validUrl = verified;
          break;
        }
      }
      return { ...item, source_url: validUrl };
    }),
  );

  await Promise.all(
    items.map(async (item) => {
      if (item.published_at || !item.source_url) return;
      try {
        const { firecrawlScrape } = await import("./web-scraper.server");
        const page = await firecrawlScrape(item.source_url, 150, 6000);
        const md = (page?.markdown ?? "").slice(0, 6000);
        if (!md) return;
        const { output: dateOut } = await generateText({
          model: ai(MODEL),
          output: Output.object({
            schema: z.object({ published_at: z.string().nullable() }),
          }),
          system: `Extrai a data de publicação da notícia/diploma a partir do conteúdo da página. Devolve YYYY-MM-DD ou null se mesmo não conseguires inferir. Procura por "Publicado em", "Data:", datas no formato DD/MM/AAAA, DD-MM-AAAA, ou referências como "1 de janeiro de 2025". Para diplomas do DRE usa a data do diploma.`,
          prompt: `Título: ${item.title}\nURL: ${item.source_url}\n\nConteúdo:\n${md}`,
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
  const dropped: string[] = [];
  for (const item of items) {
    if (!item.source_url) {
      dropped.push(item.title);
      continue;
    }
    const finalUrl = item.source_url;
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
      source_url: finalUrl,
      content_hash: hash,
      relevance_score: item.relevance_score,
      published_at: item.published_at ?? null,
    });
    if (!error) {
      created++;
      knownHashes.add(hash);
    }
  }
  return { created, dropped, error: null };
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

  const { data: newPending } = await admin
    .from("detections")
    .select("id,title,summary,source_name,source_url")
    .eq("status", "pending")
    .gte("detected_at", new Date(Date.now() - 5 * 60_000).toISOString())
    .order("relevance_score", { ascending: false })
    .limit(20);

  if ((newPending ?? []).length > 0) {
    const emailResult = await sendScanSummaryEmail(alertEmail, {
      scanned,
      created: totalCreated,
      errors,
      detections: newPending ?? [],
      origin,
      triggeredBy,
    });
    if (!emailResult.ok) {
      errors.push({ source: "Email de alertas", error: emailResult.reason });
    }
  }

  await admin
    .from("scan_runs")
    .update({
      finished_at: new Date().toISOString(),
      sources_scanned: scanned,
      detections_created: totalCreated,
      errors: errors,
    })
    .eq("id", runId);

  return { runId, scanned, created: totalCreated, errors };
}

type EmailResult = { ok: true } | { ok: false; reason: string };

async function sendScanSummaryEmail(
  to: string,
  data: {
    scanned: number;
    created: number;
    errors: { source: string; error: string }[];
    detections: { id: string; title: string; summary: string; source_name: string; source_url: string | null }[];
    origin: string;
    triggeredBy: "cron" | "manual";
  },
): Promise<EmailResult> {
  const { buildApprovalUrls } = await import("./tokens.server");
  const today = new Date().toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });
  const inboxUrl = `${data.origin}/inbox`;
  const detectionsHtml = data.detections
    .map((d) => {
      const { approveUrl, rejectUrl } = buildApprovalUrls(data.origin, d.id);
      return `
      <tr><td style="padding:16px 0;border-bottom:1px solid #e5e7eb;">
        <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">${escapeHtml(d.source_name)}</p>
        <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#0f172a;">${escapeHtml(d.title)}</p>
        <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.5;">${escapeHtml(d.summary)}</p>
        ${d.source_url ? `<p style="margin:0 0 12px;"><a href="${d.source_url}" style="color:#0891b2;font-size:13px;">Ver notícia original →</a></p>` : ""}
        <p style="margin:0;">
          <a href="${approveUrl}" style="display:inline-block;padding:8px 14px;background:#10b981;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;margin-right:8px;">✅ Aprovar</a>
          <a href="${rejectUrl}" style="display:inline-block;padding:8px 14px;background:#ef4444;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">❌ Rejeitar</a>
        </p>
      </td></tr>`;
    })
    .join("");
  const errorsHtml = data.errors.length
    ? `<p style="margin:24px 0 8px;font-size:14px;font-weight:600;color:#b91c1c;">Erros (${data.errors.length}):</p>
       <ul style="margin:0;padding-left:20px;color:#7f1d1d;font-size:13px;">${data.errors
         .map((e) => `<li>${escapeHtml(e.source)}: ${escapeHtml(e.error)}</li>`)
         .join("")}</ul>`
    : "";

  const kind = data.triggeredBy === "cron" ? "diário automático" : "manual";
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#0f172a;">
    <h1 style="margin:0 0 4px;font-size:20px;">Resumo do scan ${kind} SEPRI</h1>
    <p style="margin:0 0 16px;color:#6b7280;font-size:13px;">${today}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tr><td style="padding:8px 0;font-size:14px;color:#374151;"><strong>Fontes analisadas:</strong> ${data.scanned}</td></tr>
      <tr><td style="padding:8px 0;font-size:14px;color:#374151;"><strong>Novas deteções:</strong> ${data.created}</td></tr>
      <tr><td style="padding:8px 0;font-size:14px;color:#374151;"><strong>Erros:</strong> ${data.errors.length}</td></tr>
    </table>
    <h2 style="margin:24px 0 8px;font-size:16px;">Novas deteções</h2>
    <table style="width:100%;border-collapse:collapse;">${detectionsHtml}</table>
    ${errorsHtml}
    <p style="margin:24px 0 0;">
      <a href="${inboxUrl}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#fff;border-radius:6px;text-decoration:none;font-size:14px;">Abrir caixa de entrada</a>
    </p>
    <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;">Aprovar/Rejeitar aciona o registo diretamente — tokens válidos por 14 dias.</p>
  </div>`;

  const { sendEmail } = await import("./email.server");
  const result = await sendEmail({
    to,
    subject: `[SEPRI] Scan ${kind} — ${data.created} nova(s) deteção(ões)`,
    html,
  });
  if (!result.ok) {
    console.error("[scan-summary] envio de email falhou:", result.reason);
  }
  return result;
}

export const triggerManualScan = createServerFn({ method: "POST" }).handler(async () => {
  const { getRequestHost } = await import("@tanstack/react-start/server");
  const host = getRequestHost();
  const origin = `https://${host}`;
  return runScan(origin, "manual");
});

export const sendTestAlertEmail = createServerFn({ method: "POST" }).handler(async () => {
  const admin = await getAdmin();
  const { getRequestHost } = await import("@tanstack/react-start/server");
  const host = getRequestHost();
  const origin = `https://${host}`;
  const { data: config } = await admin.from("app_config").select("alert_email").eq("id", 1).single();
  const alertEmail = config?.alert_email ?? "joanicapereira@gmail.com";
  const result = await sendScanSummaryEmail(alertEmail, {
    scanned: 0,
    created: 0,
    errors: [],
    detections: [
      {
        id: "00000000-0000-0000-0000-000000000000",
        title: "Email de teste — configuração de alertas SEPRI",
        summary: "Se recebeste este email, a configuração do Resend está correta.",
        source_name: "Teste",
        source_url: null,
      },
    ],
    origin,
    triggeredBy: "manual",
  });
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return { ok: true, to: alertEmail };
});
