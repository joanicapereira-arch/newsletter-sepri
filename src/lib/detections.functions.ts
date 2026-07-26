import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const listDetections = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z
          .enum(["pending", "informativo", "prioritario", "rejected", "all"])
          .default("pending"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    let q = admin.from("detections").select("*").order("detected_at", { ascending: false }).limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) {
      console.error("[listDetections] db error", error);
      throw new Error("Não foi possível carregar as deteções.");
    }
    return rows ?? [];
  });

export const categorizeDetection = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        detection_id: z.string().uuid(),
        category: z.enum(["pending", "informativo", "prioritario", "rejected"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    await admin
      .from("detections")
      .update({
        status: data.category,
        decided_at: data.category === "pending" ? null : new Date().toISOString(),
      })
      .eq("id", data.detection_id);
    return { ok: true };
  });


export const generateNewsletterFromSelection = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ detection_ids: z.array(z.string().uuid()).min(1).max(20) }).parse(d),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: dets, error } = await admin
      .from("detections")
      .select("*")
      .in("id", data.detection_ids);
    if (error || !dets || dets.length === 0) {
      console.error("[generateNewsletter] db error", error);
      throw new Error("Não foi possível carregar as deteções selecionadas.");
    }
    // preserve user-selected order
    const ordered = data.detection_ids
      .map((id) => dets.find((x) => x.id === id))
      .filter((x): x is (typeof dets)[number] => !!x);

    const { data: cfg } = await admin.from("app_config").select("*").eq("id", 1).single();
    const { generateCombinedNewsletterHtml } = await import("./newsletter-ai.server");
    const { subject, html } = await generateCombinedNewsletterHtml(
      ordered.map((d) => ({
        title: d.title,
        summary: d.summary,
        source_name: d.source_name,
        source_url: d.source_url,
        published_at: d.published_at,
      })),
      {
        logo_url: cfg?.logo_url ?? "",
        disclaimer_html: cfg?.disclaimer_html ?? "",
      },
    );

    await admin.from("newsletters").insert({
      detection_id: ordered[0].id,
      detection_ids: ordered.map((d) => d.id),
      subject,
      html,
    });
    // Bump any still-pending items to 'informativo' when generating the newsletter
    await admin
      .from("detections")
      .update({ status: "informativo", decided_at: new Date().toISOString() })
      .in("id", ordered.map((d) => d.id))
      .eq("status", "pending");
    return { ok: true, count: ordered.length };
  });


export const listNewsletters = createServerFn({ method: "GET" })
  .handler(async () => {
    const admin = await getAdmin();
    const { data, error } = await admin
      .from("newsletters")
      .select("id,detection_id,subject,generated_at,detections(title,source_name,source_url)")
      .order("generated_at", { ascending: false })
      .limit(100);
    if (error) {
      console.error("[listNewsletters] db error", error);
      throw new Error("Não foi possível carregar as newsletters.");
    }
    return data ?? [];
  });

export const getNewsletter = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: row, error } = await admin.from("newsletters").select("*").eq("id", data.id).single();
    if (error) {
      console.error("[getNewsletter] db error", error);
      throw new Error("Não foi possível carregar a newsletter.");
    }
    return row;
  });

export const listScanRuns = createServerFn({ method: "GET" })
  .handler(async () => {
    const admin = await getAdmin();
    const { data } = await admin
      .from("scan_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });

/**
 * Regenera o HTML de todas as newsletters já existentes, aplicando o
 * template atual. Usa detection_ids guardados (ou fallback detection_id).
 */
export const regenerateAllNewsletters = createServerFn({ method: "POST" })
  .handler(async () => {
    const admin = await getAdmin();
    const { data: newsletters } = await admin
      .from("newsletters")
      .select("id,detection_id,detection_ids");
    if (!newsletters?.length) return { updated: 0 };

    const { data: cfg } = await admin.from("app_config").select("*").eq("id", 1).single();
    const { generateCombinedNewsletterHtml } = await import("./newsletter-ai.server");

    let updated = 0;
    for (const n of newsletters) {
      const ids =
        n.detection_ids && n.detection_ids.length
          ? n.detection_ids
          : n.detection_id
          ? [n.detection_id]
          : [];
      if (!ids.length) continue;
      const { data: dets } = await admin.from("detections").select("*").in("id", ids);
      if (!dets?.length) continue;
      const ordered = ids
        .map((id) => dets.find((x) => x.id === id))
        .filter((x): x is (typeof dets)[number] => !!x);
      try {
        const { subject, html } = await generateCombinedNewsletterHtml(
          ordered.map((d) => ({
            title: d.title,
            summary: d.summary,
            source_name: d.source_name,
            source_url: d.source_url,
            published_at: d.published_at,
          })),
          {
            logo_url: cfg?.logo_url ?? "",
            disclaimer_html: cfg?.disclaimer_html ?? "",
          },
        );
        const { error } = await admin
          .from("newsletters")
          .update({ subject, html, generated_at: new Date().toISOString() })
          .eq("id", n.id);
        if (!error) updated++;
      } catch (e) {
        console.error("[regenerate] failed", n.id, e);
      }
    }
    return { updated };
  });

/**
 * Corrige URLs de deteções existentes: para cada deteção sem source_url ou
 * com source_url igual à URL raiz da fonte, re-raspa a fonte, extrai os
 * links da página, e faz match fuzzy título→link.
 */
export const backfillDetectionUrls = createServerFn({ method: "POST" })
  .handler(async () => {
    const admin = await getAdmin();
    const { data: sources } = await admin
      .from("sources")
      .select("id,name,url")
      .eq("active", true);
    if (!sources?.length) return { updated: 0, checked: 0 };

    const { data: dets } = await admin
      .from("detections")
      .select("id,title,source_id,source_url");
    if (!dets?.length) return { updated: 0, checked: 0 };

    const { firecrawlDeepScrape, resolveUrlForTitle } = await import("./firecrawl.server");

    let updated = 0;
    let checked = 0;
    for (const src of sources) {
      const rootNorm = src.url.replace(/\/$/, "");
      const targets = dets.filter((d) => {
        if (d.source_id !== src.id) return false;
        const u = d.source_url?.trim() ?? "";
        return !u || u === src.url || u.replace(/\/$/, "") === rootNorm;
      });
      if (!targets.length) continue;
      let deep;
      try {
        deep = await firecrawlDeepScrape(src.url, { maxPages: 1, perPageChars: 2500 });
      } catch (e) {
        console.error("[backfill] scrape failed", src.name, e);
        continue;
      }
      for (const d of targets) {
        checked++;
        const resolved = resolveUrlForTitle(d.title, deep.links, src.url);
        if (resolved) {
          const { error } = await admin
            .from("detections")
            .update({ source_url: resolved })
            .eq("id", d.id);
          if (!error) updated++;
        }
      }
    }
    return { updated, checked };
  });

