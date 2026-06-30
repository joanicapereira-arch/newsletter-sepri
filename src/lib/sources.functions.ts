import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
async function ensureAdmin(userId: string) {
  const a = await admin();
  const { data } = await a.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Sem permissões");
  return a;
}

export const listSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const a = await ensureAdmin(context.userId);
    const { data, error } = await a.from("sources").select("*").order("name");
    if (error) throw new Error(error.message);
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SourceInput.parse(d))
  .handler(async ({ data, context }) => {
    const a = await ensureAdmin(context.userId);
    if (data.id) {
      await a.from("sources").update({ ...data, updated_at: new Date().toISOString() }).eq("id", data.id);
    } else {
      await a.from("sources").insert(data);
    }
    return { ok: true };
  });

export const deleteSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await ensureAdmin(context.userId);
    await a.from("sources").delete().eq("id", data.id);
    return { ok: true };
  });

export const getConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const a = await ensureAdmin(context.userId);
    const { data } = await a.from("app_config").select("*").eq("id", 1).single();
    return data;
  });

const ConfigInput = z.object({
  logo_url: z.string().url(),
  disclaimer_html: z.string(),
  alert_email: z.string().email(),
});

export const updateConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ConfigInput.parse(d))
  .handler(async ({ data, context }) => {
    const a = await ensureAdmin(context.userId);
    await a.from("app_config").update({ ...data, updated_at: new Date().toISOString() }).eq("id", 1);
    return { ok: true };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const a = await admin();
    const { data } = await a.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    return { isAdmin: !!data, userId: context.userId };
  });
