import { createClient } from "@supabase/supabase-js";
import { generateCombinedNewsletterHtml } from "@/lib/newsletter-ai.server";

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const DET = "cbea17d3-582a-4c6f-9921-539f58ed55ab";
const NL = "d8e3e4b2-0800-4213-9868-ef149f1f57e8";

const { data: d, error: e1 } = await admin.from("detections").select("title,summary,source_name,source_url,published_at").eq("id", DET).single();
if (e1 || !d) throw e1;
const { data: cfg } = await admin.from("app_config").select("logo_url,disclaimer_html").eq("id", 1).single();

const { subject, html } = await generateCombinedNewsletterHtml([d as any], cfg as any);
const { error: e2 } = await admin.from("newsletters").update({ subject, html, generated_at: new Date().toISOString() }).eq("id", NL);
if (e2) throw e2;
console.log("OK subject:", subject);
console.log("len:", html.length);
console.log("hasRecomend:", /Recomenda|Orienta/i.test(html));
console.log("socialAnchors:", (html.match(/<a href="https:\/\/(www\.)?(linkedin|instagram|facebook|youtube)[^"]*"/g) || []));
