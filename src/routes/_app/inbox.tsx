import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listDetections,
  categorizeDetection,
  generateNewsletterFromSelection,
  addManualDetection,
} from "@/lib/detections.functions";
import { listSources } from "@/lib/sources.functions";
import { triggerManualScan } from "@/lib/scan.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Info,
  Flame,
  X,
  ExternalLink,
  RefreshCw,
  Loader2,
  Sparkles,
  Undo2,
  Plus,
} from "lucide-react";

export const Route = createFileRoute("/_app/inbox")({
  head: () => ({ meta: [{ title: "Caixa de entrada · SEPRI" }] }),
  component: InboxPage,
});


type Status = "pending" | "informativo" | "prioritario" | "rejected";
type Category = "pending" | "informativo" | "prioritario" | "rejected";

function InboxPage() {
  const [status, setStatus] = useState<Status>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const qc = useQueryClient();

  const { data: detections, isLoading } = useQuery({
    queryKey: ["detections", status],
    queryFn: () => listDetections({ data: { status } }),
  });

  const isCategorized = status === "informativo" || status === "prioritario";

  const selectableIds = useMemo(
    () => (isCategorized ? (detections ?? []).map((d) => d.id) : []),
    [detections, isCategorized],
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

  const categorizeMut = useMutation({
    mutationFn: ({ id, category }: { id: string; category: Category }) =>
      categorizeDetection({ data: { detection_id: id, category } }),
    onSuccess: (_r, vars) => {
      const label =
        vars.category === "informativo"
          ? "Marcada como Informativo"
          : vars.category === "prioritario"
            ? "Marcada como Prioritário"
            : vars.category === "rejected"
              ? "Rejeitada"
              : "Devolvida a Pendentes";
      toast.success(label);
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
            Categoriza cada notícia como Informativo, Prioritário ou Rejeitar. Depois seleciona
            as que queres incluir e gera uma newsletter.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => scanMut.mutate()} disabled={scanMut.isPending}>
            {scanMut.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Scan agora
          </Button>
        </div>
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
          <TabsTrigger value="informativo">Informativo</TabsTrigger>
          <TabsTrigger value="prioritario">Prioritário</TabsTrigger>
          <TabsTrigger value="rejected">Rejeitado</TabsTrigger>
        </TabsList>
      </Tabs>

      {status === "pending" && (
        <div className="border rounded-md p-3 mb-4 bg-muted/30 text-sm text-muted-foreground">
          Começa por classificar cada notícia como <strong>Informativo</strong>,{" "}
          <strong>Prioritário</strong> ou <strong>Rejeitar</strong>. Depois, nas secções{" "}
          <strong>Informativo</strong> ou <strong>Prioritário</strong>, seleciona várias e clica em{" "}
          <strong>Gerar newsletter</strong> para criar uma newsletter combinada.
        </div>
      )}

      {isCategorized && selectableIds.length > 0 && (
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border rounded-md p-3 mb-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">{selected.size} selecionada(s)</span>
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
          const isSelectable = isCategorized;
          const checked = selected.has(d.id);
          const pending = categorizeMut.isPending && categorizeMut.variables?.id === d.id;
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
                      {d.status === "informativo" && (
                        <Badge className="bg-sky-600">Informativo</Badge>
                      )}
                      {d.status === "prioritario" && (
                        <Badge className="bg-orange-600">Prioritário</Badge>
                      )}
                      {d.status === "rejected" && <Badge variant="destructive">Rejeitado</Badge>}
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
                  {d.status !== "informativo" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => categorizeMut.mutate({ id: d.id, category: "informativo" })}
                      disabled={pending}
                    >
                      <Info className="w-4 h-4 mr-1" /> Informativo
                    </Button>
                  )}
                  {d.status !== "prioritario" && (
                    <Button
                      size="sm"
                      variant={d.status === "pending" ? "default" : "outline"}
                      onClick={() => categorizeMut.mutate({ id: d.id, category: "prioritario" })}
                      disabled={pending}
                    >
                      <Flame className="w-4 h-4 mr-1" /> Prioritário
                    </Button>
                  )}
                  {d.status !== "rejected" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => categorizeMut.mutate({ id: d.id, category: "rejected" })}
                      disabled={pending}
                    >
                      <X className="w-4 h-4 mr-1" /> Rejeitar
                    </Button>
                  )}
                  {d.status !== "pending" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => categorizeMut.mutate({ id: d.id, category: "pending" })}
                      disabled={pending}
                    >
                      <Undo2 className="w-4 h-4 mr-1" /> Voltar a Pendentes
                    </Button>
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
