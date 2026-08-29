import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const listSources = createServerFn({ method: "GET" }).handler(async () => {
  const a = await getAdmin();
  const { data, error } = await a.from("sources").select("*").order("name");
  if (error) {
    console.error("[listSources] db error", error);
    throw new Error("Não foi possível carregar as fontes.");
  }
  return data ?? [];
});

const SourceInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  url: z.string().url(),
  description: z.string().nullable().optional(),
  keywords: z.array(z.string()),
  active: z.boolean(),
});

export const upsertSource = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SourceInput.parse(d))
  .handler(async ({ data }) => {
    const a = await getAdmin();
    if (data.id) {
      await a.from("sources").update({ ...data, updated_at: new Date().toISOString() }).eq("id", data.id);
    } else {
      await a.from("sources").insert(data);
    }
    return { ok: true };
  });

export const deleteSource = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const a = await getAdmin();
    await a.from("sources").delete().eq("id", data.id);
    return { ok: true };
  });

export const getConfig = createServerFn({ method: "GET" }).handler(async () => {
  const a = await getAdmin();
  const { data } = await a.from("app_config").select("*").eq("id", 1).single();
  return data;
});

const ConfigInput = z.object({
  logo_url: z.string().url(),
  disclaimer_html: z.string(),
  alert_email: z.string().email(),
  scan_window_days: z.coerce.number().int().min(1).max(365),
});

export const updateConfig = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ConfigInput.parse(d))
  .handler(async ({ data }) => {
    const a = await getAdmin();
    await a.from("app_config").update({ ...data, updated_at: new Date().toISOString() }).eq("id", 1);
    return { ok: true };
  });

export const checkIsAdmin = createServerFn({ method: "GET" }).handler(async () => {
  return { isAdmin: true, userId: "anon" };
});
