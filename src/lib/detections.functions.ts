import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const listDetections = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ status: z.enum(["pending", "approved", "rejected", "all"]).default("pending") }).parse(d),
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

export const approveDetection = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ detection_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: det, error } = await admin
      .from("detections")
      .select("*")
      .eq("id", data.detection_id)
      .single();
    if (error || !det) throw new Error("Deteção não encontrada");
    if (det.status !== "pending") return { already: true, status: det.status };

    const { data: cfg } = await admin.from("app_config").select("*").eq("id", 1).single();
    const { generateNewsletterHtml } = await import("./newsletter-ai.server");
    const { subject, html } = await generateNewsletterHtml(
      {
        title: det.title,
        summary: det.summary,
        source_name: det.source_name,
        source_url: det.source_url,
        published_at: det.published_at,
      },
      {
        logo_url: cfg?.logo_url ?? "https://via.placeholder.com/200x60?text=SEPRI",
        disclaimer_html: cfg?.disclaimer_html ?? "",
      },
    );

    await admin.from("newsletters").insert({ detection_id: det.id, subject, html });
    await admin
      .from("detections")
      .update({
        status: "approved",
        decided_at: new Date().toISOString(),
      })
      .eq("id", det.id);
    return { ok: true };
  });

export const rejectDetection = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ detection_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    await admin
      .from("detections")
      .update({
        status: "rejected",
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.detection_id);
    return { ok: true };
  });

export const regenerateNewsletter = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ detection_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: det } = await admin.from("detections").select("*").eq("id", data.detection_id).single();
    if (!det) throw new Error("Deteção não encontrada");
    const { data: cfg } = await admin.from("app_config").select("*").eq("id", 1).single();
    const { generateNewsletterHtml } = await import("./newsletter-ai.server");
    const { subject, html } = await generateNewsletterHtml(
      {
        title: det.title,
        summary: det.summary,
        source_name: det.source_name,
        source_url: det.source_url,
        published_at: det.published_at,
      },
      {
        logo_url: cfg?.logo_url ?? "",
        disclaimer_html: cfg?.disclaimer_html ?? "",
      },
    );
    await admin.from("newsletters").insert({ detection_id: det.id, subject, html });
    return { ok: true };
  });

export const listNewsletters = createServerFn({ method: "GET" })
  .handler(async () => {
    const admin = await getAdmin();
    const { data, error } = await admin
      .from("newsletters")
      .select("id,detection_id,subject,generated_at,detections(title,source_name,source_url)")
      .order("generated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getNewsletter = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: row, error } = await admin.from("newsletters").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
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
