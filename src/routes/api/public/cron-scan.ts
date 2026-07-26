import { createFileRoute } from "@tanstack/react-router";
import { runScan } from "@/lib/scan.functions";

export const Route = createFileRoute("/api/public/cron-scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
