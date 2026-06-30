import { createFileRoute } from "@tanstack/react-router";
import { verifyToken } from "@/lib/tokens.server";

function page(title: string, body: string, color: string) {
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:-apple-system,Arial,sans-serif;background:#f8fafc;color:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;padding:40px;border-radius:12px;max-width:480px;box-shadow:0 4px 12px rgba(0,0,0,.05);text-align:center}
h1{color:${color};margin:0 0 12px;font-size:24px}p{line-height:1.5;color:#475569}
a{color:#0f5e8f;text-decoration:none;font-weight:600;display:inline-block;margin-top:16px}</style>
</head><body><div class="card"><h1>${title}</h1>${body}<a href="/">Ir para o dashboard SEPRI →</a></div></body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const Route = createFileRoute("/api/public/reject")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? "";
        const parsed = verifyToken(token);
        if (!parsed || parsed.action !== "reject") {
          return new Response(page("Link inválido", "<p>Este link é inválido ou expirou.</p>", "#dc2626"), {
            status: 400,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: det } = await supabaseAdmin
          .from("detections")
          .select("*")
          .eq("id", parsed.detectionId)
          .single();
        if (!det) {
          return new Response(page("Não encontrada", "<p>A deteção já não existe.</p>", "#dc2626"), {
            status: 404,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
        if (det.status === "pending") {
          await supabaseAdmin
            .from("detections")
            .update({ status: "rejected", decided_at: new Date().toISOString() })
            .eq("id", det.id);
        }
        return new Response(
          page(
            "Rejeitada",
            `<p>A deteção <em>"${escapeHtml(det.title)}"</em> foi marcada como rejeitada.</p>`,
            "#0f5e8f",
          ),
          { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      },
    },
  },
});
