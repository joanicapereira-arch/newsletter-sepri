import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listScanRuns } from "@/lib/detections.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "Histórico · SEPRI" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const { data } = useQuery({ queryKey: ["scan_runs"], queryFn: () => listScanRuns() });
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Histórico de scans</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Execuções do cron diário e scans manuais.
      </p>
      <div className="space-y-2">
        {data?.map((r) => {
          const errs = Array.isArray(r.errors) ? r.errors : [];
          return (
            <Card key={r.id}>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={r.triggered_by === "cron" ? "secondary" : "outline"}>
                        {r.triggered_by}
                      </Badge>
                      {errs.length > 0 && <Badge variant="destructive">{errs.length} erros</Badge>}
                    </div>
                    <div className="text-sm">
                      <strong>{r.detections_created}</strong> novas deteções ·{" "}
                      <strong>{r.sources_scanned}</strong> fontes
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(r.started_at).toLocaleString("pt-PT")}
                      {r.finished_at && ` → ${new Date(r.finished_at).toLocaleTimeString("pt-PT")}`}
                    </div>
                    {errs.length > 0 && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-destructive">Ver erros</summary>
                        <pre className="mt-1 p-2 bg-muted rounded text-[11px] overflow-auto">
                          {JSON.stringify(errs, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {data && data.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Sem execuções ainda.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
