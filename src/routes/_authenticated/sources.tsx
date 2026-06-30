import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listSources, upsertSource, deleteSource } from "@/lib/sources.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sources")({
  head: () => ({ meta: [{ title: "Fontes · SEPRI" }] }),
  component: SourcesPage,
});

interface SourceRow {
  id: string;
  name: string;
  url: string;
  description: string | null;
  keywords: string[];
  active: boolean;
}

function SourcesPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["sources"], queryFn: () => listSources() });
  const [draft, setDraft] = useState<Partial<SourceRow> | null>(null);

  const save = useMutation({
    mutationFn: (s: Partial<SourceRow>) =>
      upsertSource({
        data: {
          id: s.id,
          name: s.name!,
          url: s.url!,
          description: s.description ?? null,
          keywords: s.keywords ?? [],
          active: s.active ?? true,
        },
      }),
    onSuccess: () => {
      toast.success("Guardado");
      qc.invalidateQueries({ queryKey: ["sources"] });
      setDraft(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteSource({ data: { id } }),
    onSuccess: () => {
      toast.success("Removida");
      qc.invalidateQueries({ queryKey: ["sources"] });
    },
  });

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Fontes monitorizadas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fontes que o bot lê diariamente. Palavras-chave ajudam a IA a filtrar.
          </p>
        </div>
        <Button
          onClick={() =>
            setDraft({ name: "", url: "", description: "", keywords: [], active: true })
          }
        >
          <Plus className="w-4 h-4 mr-1" /> Nova fonte
        </Button>
      </div>

      <div className="space-y-3">
        {data?.map((s) => (
          <Card key={s.id}>
            <CardContent className="pt-6">
              {draft?.id === s.id ? (
                <Editor
                  draft={draft}
                  onChange={setDraft}
                  onSave={() => save.mutate(draft)}
                  onCancel={() => setDraft(null)}
                  pending={save.isPending}
                />
              ) : (
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{s.name}</h3>
                      {!s.active && (
                        <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          inativa
                        </span>
                      )}
                    </div>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline break-all"
                    >
                      {s.url}
                    </a>
                    {s.description && (
                      <p className="text-sm text-muted-foreground mt-2">{s.description}</p>
                    )}
                    {s.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {s.keywords.map((k) => (
                          <span
                            key={k}
                            className="text-xs px-2 py-0.5 rounded bg-accent text-accent-foreground"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDraft(s)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Remover ${s.name}?`)) del.mutate(s.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {draft && !draft.id && (
          <Card>
            <CardContent className="pt-6">
              <Editor
                draft={draft}
                onChange={setDraft}
                onSave={() => save.mutate(draft)}
                onCancel={() => setDraft(null)}
                pending={save.isPending}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Editor({
  draft,
  onChange,
  onSave,
  onCancel,
  pending,
}: {
  draft: Partial<SourceRow>;
  onChange: (d: Partial<SourceRow>) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Nome</Label>
          <Input value={draft.name ?? ""} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
        </div>
        <div>
          <Label>URL</Label>
          <Input value={draft.url ?? ""} onChange={(e) => onChange({ ...draft, url: e.target.value })} />
        </div>
      </div>
      <div>
        <Label>Descrição</Label>
        <Textarea
          rows={2}
          value={draft.description ?? ""}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
        />
      </div>
      <div>
        <Label>Palavras-chave (separadas por vírgula)</Label>
        <Input
          value={(draft.keywords ?? []).join(", ")}
          onChange={(e) =>
            onChange({
              ...draft,
              keywords: e.target.value
                .split(",")
                .map((k) => k.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            checked={draft.active ?? true}
            onCheckedChange={(v) => onChange({ ...draft, active: v })}
          />
          <span className="text-sm">Ativa</span>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={pending}>
            <Save className="w-4 h-4 mr-1" /> Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}
