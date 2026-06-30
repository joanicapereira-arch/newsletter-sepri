import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createHash } from "crypto";
import { createLovableAi, requireLovableApiKey } from "./ai-gateway.server";
import { firecrawlScrape } from "./firecrawl.server";
import { buildApprovalUrls } from "./tokens.server";

const MODEL = "google/gemini-3-flash-preview";

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

async function scanOneSource(source: SourceRow, recentHashes: Set<string>) {
  const scrape = await firecrawlScrape(source.url);
  const content = (scrape?.markdown ?? "").slice(0, 12000);
  if (!content) return { created: 0, error: null as string | null };

  const apiKey = requireLovableApiKey();
  const ai = createLovableAi(apiKey);

  const { output } = await generateText({
    model: ai(MODEL),
    output: Output.object({
      schema: z.object({
        items: z.array(
          z.object({
            title: z.string(),
            summary: z.string(),
            source_url: z.string().nullable(),
            relevance_score: z.number().min(0).max(100),
          }),
        ),
      }),
    }),
    system: `És um analista que monitoriza legislação e técnica para a SEPRI Group (medicina e segurança no trabalho em Portugal).
Recebes conteúdo bruto de uma fonte e devolves SÓ as novidades genuinamente RELEVANTES para os temas SEPRI:
medicina do trabalho, segurança no trabalho (SST), riscos psicossociais, autoproteção de edifícios e incêndios,
legionella, formação obrigatória, Lei 102/2009, Código do Trabalho, exames a trabalhadores expostos,
campanhas EU-OSHA, alterações climáticas e trabalho. Para a Ordem dos Psicólogos, APENAS Psicologia do Trabalho.
Ignora notícias institucionais genéricas, eventos sem impacto técnico, e tudo que seja off-topic.
Devolve no máximo 5 itens. Se não houver nada relevante, devolve items: [].
relevance_score: 0-100 (100 = altamente crítico).`,
    prompt: `Fonte: ${source.name}
URL: ${source.url}
Palavras-chave de interesse: ${source.keywords.join(", ")}

Conteúdo (markdown):
---
${content}
---

Extrai novidades relevantes.`,
  });

  const items = output.items.filter((i) => i.relevance_score >= 40);
  const admin = await getAdmin();
  let created = 0;
  for (const item of items) {
    const hash = createHash("sha256")
      .update(`${source.id}:${item.title.toLowerCase().trim()}`)
      .digest("hex")
      .slice(0, 32);
    if (recentHashes.has(hash)) continue;
    const { error } = await admin.from("detections").insert({
      source_id: source.id,
      source_name: source.name,
      title: item.title,
      summary: item.summary,
      source_url: item.source_url ?? source.url,
      content_hash: hash,
      relevance_score: item.relevance_score,
    });
    if (!error) created++;
  }
  return { created, error: null };
}

async function sendAlertEmail(
  to: string,
  detection: { id: string; title: string; summary: string; source_name: string; source_url: string | null },
  origin: string,
) {
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
  const { data: recent } = await admin
    .from("detections")
    .select("content_hash")
    .gte("detected_at", new Date(Date.now() - 60 * 86400_000).toISOString());
  const recentHashes = new Set((recent ?? []).map((r) => r.content_hash));

  const { data: config } = await admin
    .from("app_config")
    .select("alert_email")
    .eq("id", 1)
    .single();
  const alertEmail = config?.alert_email ?? "joanicapereira@gmail.com";

  const errors: { source: string; error: string }[] = [];
  let totalCreated = 0;
  let scanned = 0;
  for (const src of (sources ?? []) as SourceRow[]) {
    try {
      const res = await scanOneSource(src, recentHashes);
      totalCreated += res.created;
      scanned++;
    } catch (e) {
      errors.push({ source: src.name, error: String((e as Error).message ?? e) });
    }
  }

  // Send alerts for new pending detections from this run
  const { data: newPending } = await admin
    .from("detections")
    .select("id,title,summary,source_name,source_url")
    .eq("status", "pending")
    .gte("detected_at", new Date(Date.now() - 5 * 60_000).toISOString())
    .order("relevance_score", { ascending: false })
    .limit(20);
  for (const d of newPending ?? []) {
    await sendAlertEmail(alertEmail, d, origin);
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

export const triggerManualScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await getAdmin();
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Sem permissões");
    const { getRequestHost } = await import("@tanstack/react-start/server");
    const host = getRequestHost();
    const origin = `https://${host}`;
    return runScan(origin, "manual");
  });
