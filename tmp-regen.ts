import { createClient } from "@supabase/supabase-js";
import { generateCombinedNewsletterHtml } from "./src/lib/newsletter-ai.server";

const sb = createClient(process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const NL = "e72e8d13-1f31-418a-9010-8b7ed1edaf4f";
const DET = "9d632c1c-bd48-45fe-80a8-78659cd64818";

const { data: d, error: e1 } = await sb.from("detections").select("title,summary,source_name,source_url,published_at").eq("id", DET).single();
if (e1) throw e1;
const { data: cfg } = await sb.from("app_config").select("logo_url,disclaimer_html").eq("id", 1).single();

const { subject, html } = await generateCombinedNewsletterHtml([d as any], { logo_url: cfg?.logo_url ?? "", disclaimer_html: cfg?.disclaimer_html ?? "" });
const { error: e2 } = await sb.from("newsletters").update({ subject, html, generated_at: new Date().toISOString() }).eq("id", NL);
if (e2) throw e2;
console.log("SUBJECT:", subject);
console.log("LEN:", html.length);
const body = html.slice(html.indexOf("<body"), html.indexOf("<body") + 6000);
console.log(body);
