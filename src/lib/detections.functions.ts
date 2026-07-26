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
        category: z.enum(["informativo", "prioritario", "rejected"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    await admin
      .from("detections")
      .update({ status: data.category, decided_at: new Date().toISOString() })
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
