import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listDetections,
  approveDetection,
  rejectDetection,
  generateNewsletterFromSelection,
} from "@/lib/detections.functions";
import { triggerManualScan } from "@/lib/scan.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, ExternalLink, RefreshCw, Loader2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_app/inbox")({
  head: () => ({ meta: [{ title: "Caixa de entrada · SEPRI" }] }),
  component: InboxPage,
});

type Status = "pending" | "approved" | "rejected" | "all";

function InboxPage() {
  const [status, setStatus] = useState<Status>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const qc = useQueryClient();

  const { data: detections, isLoading } = useQuery({
    queryKey: ["detections", status],
    queryFn: () => listDetections({ data: { status } }),
  });

  const selectableIds = useMemo(
    () =>
      status === "approved"
        ? (detections ?? []).map((d) => d.id)
        : [],
    [detections, status],
  );


  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }
  function selectAll() {
    setSelected(new Set(selectableIds));
  }

  const approveMut = useMutation({
    mutationFn: (id: string) => approveDetection({ data: { detection_id: id } }),
    onSuccess: () => {
      toast.success("Aprovada");
      qc.invalidateQueries({ queryKey: ["detections"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rejectMut = useMutation({
    mutationFn: (id: string) => rejectDetection({ data: { detection_id: id } }),
    onSuccess: () => {
      toast.success("Rejeitada");
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
  const generateMut = useMutation({
    mutationFn: (ids: string[]) =>
      generateNewsletterFromSelection({ data: { detection_ids: ids } }),
    onSuccess: (r) => {
      toast.success(`Newsletter gerada com ${r.count} notícia(s).`);
      clearSelection();
      qc.invalidateQueries({ queryKey: ["detections"] });
      qc.invalidateQueries({ queryKey: ["newsletters"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Caixa de entrada</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Seleciona as notícias que queres incluir e gera uma newsletter com todas.
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

      <Tabs
        value={status}
        onValueChange={(v) => {
          setStatus(v as Status);
          clearSelection();
        }}
        className="mb-4"
      >
        <TabsList>
          <TabsTrigger value="pending">Pendentes</TabsTrigger>
          <TabsTrigger value="approved">Aprovadas</TabsTrigger>
          <TabsTrigger value="rejected">Rejeitadas</TabsTrigger>
          <TabsTrigger value="all">Todas</TabsTrigger>
        </TabsList>
      </Tabs>

      {status === "pending" && (
        <div className="border rounded-md p-3 mb-4 bg-muted/30 text-sm text-muted-foreground">
          Começa por <strong>aprovar</strong> ou <strong>rejeitar</strong> as notícias detetadas.
          Depois, na secção <strong>Aprovadas</strong>, podes selecionar várias e clicar em
          <strong> Gerar newsletter</strong> para criar uma newsletter combinada.
        </div>
      )}

      {status === "approved" && selectableIds.length > 0 && (
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border rounded-md p-3 mb-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">
            {selected.size} selecionada(s)
          </span>
          <Button size="sm" variant="ghost" onClick={selectAll}>
            Selecionar todas
          </Button>
          {selected.size > 0 && (
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              Limpar
            </Button>
          )}
          <div className="ml-auto">
            <Button
              size="sm"
              onClick={() => generateMut.mutate(Array.from(selected))}
              disabled={selected.size === 0 || generateMut.isPending}
            >
              {generateMut.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Gerar newsletter
            </Button>
          </div>
        </div>
      )}


      {isLoading && <p className="text-muted-foreground">A carregar…</p>}

      {detections && detections.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nada por aqui. Corre um scan ou aguarda a próxima execução automática.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {detections?.map((d) => {
          const isSelectable = status === "approved";
          const checked = selected.has(d.id);
          return (
            <Card key={d.id} className={checked ? "ring-2 ring-primary" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  {isSelectable && (
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(d.id)}
                      className="mt-1"
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="secondary">{d.source_name}</Badge>
                      <Badge variant="outline">Relevância {d.relevance_score}</Badge>
                      {d.status === "approved" && (
                        <Badge className="bg-green-600">Aprovada</Badge>
                      )}
                      {d.status === "rejected" && (
                        <Badge variant="destructive">Rejeitada</Badge>
                      )}
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
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground mr-auto">
                    {d.published_at
                      ? `Publicada ${new Date(d.published_at).toLocaleDateString("pt-PT")} · `
                      : ""}
                    Detetada {new Date(d.detected_at).toLocaleString("pt-PT")}
                  </span>
                  {d.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rejectMut.mutate(d.id)}
                        disabled={rejectMut.isPending}
                      >
                        <X className="w-4 h-4 mr-1" /> Rejeitar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => approveMut.mutate(d.id)}
                        disabled={approveMut.isPending}
                      >
                        <Check className="w-4 h-4 mr-1" /> Aprovar
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
