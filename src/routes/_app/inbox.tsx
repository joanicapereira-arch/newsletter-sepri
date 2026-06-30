import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listDetections,
  approveDetection,
  rejectDetection,
} from "@/lib/detections.functions";
import { triggerManualScan } from "@/lib/scan.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, ExternalLink, RefreshCw, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({ meta: [{ title: "Caixa de entrada · SEPRI" }] }),
  component: InboxPage,
});

type Status = "pending" | "approved" | "rejected" | "all";

function InboxPage() {
  const [status, setStatus] = useState<Status>("pending");
  const qc = useQueryClient();

  const { data: detections, isLoading } = useQuery({
    queryKey: ["detections", status],
    queryFn: () => listDetections({ data: { status } }),
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => approveDetection({ data: { detection_id: id } }),
    onSuccess: () => {
      toast.success("Aprovado. Newsletter gerada.");
      qc.invalidateQueries({ queryKey: ["detections"] });
      qc.invalidateQueries({ queryKey: ["newsletters"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rejectMut = useMutation({
    mutationFn: (id: string) => rejectDetection({ data: { detection_id: id } }),
    onSuccess: () => {
      toast.success("Rejeitado");
      qc.invalidateQueries({ queryKey: ["detections"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const scanMut = useMutation({
    mutationFn: () => triggerManualScan(),
    onSuccess: (r) => {
      toast.success(`Scan concluído: ${r.created} novas deteções em ${r.scanned} fontes`);
      qc.invalidateQueries({ queryKey: ["detections"] });
    },
    onError: (e: Error) => toast.error(`Scan falhou: ${e.message}`),
  });

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Caixa de entrada</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Novidades detetadas nas fontes monitorizadas
          </p>
        </div>
        <Button onClick={() => scanMut.mutate()} disabled={scanMut.isPending}>
          {scanMut.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Scan agora
        </Button>
      </div>

      <Tabs value={status} onValueChange={(v) => setStatus(v as Status)} className="mb-6">
        <TabsList>
          <TabsTrigger value="pending">Pendentes</TabsTrigger>
          <TabsTrigger value="approved">Aprovadas</TabsTrigger>
          <TabsTrigger value="rejected">Rejeitadas</TabsTrigger>
          <TabsTrigger value="all">Todas</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading && <p className="text-muted-foreground">A carregar…</p>}

      {detections && detections.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nada por aqui. Corre um scan ou aguarda a próxima execução automática.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {detections?.map((d) => (
          <Card key={d.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary">{d.source_name}</Badge>
                    <Badge variant="outline">Relevância {d.relevance_score}</Badge>
                    {d.status === "approved" && <Badge className="bg-green-600">Aprovada</Badge>}
                    {d.status === "rejected" && <Badge variant="destructive">Rejeitada</Badge>}
                  </div>
                  <CardTitle className="text-lg">{d.title}</CardTitle>
                </div>
                {d.source_url && (
                  <a
                    href={d.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                    title="Ver fonte"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground/80 mb-4">{d.summary}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground mr-auto">
                  Detetada {new Date(d.detected_at).toLocaleString("pt-PT")}
                </span>
                {d.status === "pending" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rejectMut.mutate(d.id)}
                      disabled={rejectMut.isPending || approveMut.isPending}
                    >
                      <X className="w-4 h-4 mr-1" /> Rejeitar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => approveMut.mutate(d.id)}
                      disabled={approveMut.isPending || rejectMut.isPending}
                    >
                      {approveMut.isPending && approveMut.variables === d.id ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4 mr-1" />
                      )}
                      Aprovar e gerar
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
