import { createFileRoute } from "@tanstack/react-router";
import { runScan } from "@/lib/scan.functions";

// Endpoint invocado automaticamente todos os dias (ver migração SQL que
// agenda um pg_cron + pg_net a chamar este URL). Como está sob /api/public,
// exigimos um segredo partilhado para impedir que alguém de fora dispare
// scans arbitrários (que consomem créditos de IA/Firecrawl). Define o
// segredo como CRON_SECRET nas secrets do Lovable Cloud e usa o mesmo valor
// no cabeçalho "x-cron-secret" configurado na migração do pg_cron.
export const Route = createFileRoute("/api/public/cron-scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET;
        if (expected) {
          const provided = request.headers.get("x-cron-secret");
          if (provided !== expected) {
            return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
          }
        }
        const url = new URL(request.url);
        const origin = `${url.protocol}//${url.host}`;
        try {
          const result = await runScan(origin, "cron");
          return Response.json({ ok: true, ...result });
        } catch (e) {
          console.error("cron-scan failed", e);
          return Response.json({ ok: false, error: "Ocorreu um erro ao processar o pedido." }, { status: 500 });
        }
      },
    },
  },
});
