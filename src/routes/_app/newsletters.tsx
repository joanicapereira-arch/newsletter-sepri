import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listNewsletters,
  getNewsletter,
  getNewsletterDocx,
} from "@/lib/detections.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Download, Eye, FileText } from "lucide-react";

export const Route = createFileRoute("/_app/newsletters")({
  head: () => ({ meta: [{ title: "Newsletters · SEPRI" }] }),
  component: NewslettersPage,
});

function NewslettersPage() {
  
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["newsletters"],
    queryFn: () => listNewsletters(),
  });
  const { data: full } = useQuery({
    queryKey: ["newsletter", openId],
    queryFn: () => getNewsletter({ data: { id: openId! } }),
    enabled: !!openId,
  });



  async function copyHtml(html: string) {
    await navigator.clipboard.writeText(html);
    toast.success("HTML copiado");
  }
  function downloadHtml(subject: string, html: string) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${subject.replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}.html`;
    a.click();
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Newsletters geradas</h1>
          <p className="text-sm text-muted-foreground">
            HTML pronto a copiar para Brevo. Cada item corresponde a uma deteção aprovada.
          </p>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground">A carregar…</p>}
      {data && data.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Ainda nenhuma newsletter gerada. Aprova uma deteção na caixa de entrada.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data?.map((n) => {
          const det = n.detections as { title: string; source_name: string } | null;
          return (
            <Card key={n.id}>
              <CardHeader>
                {det && <Badge variant="secondary" className="w-fit mb-2">{det.source_name}</Badge>}
                <CardTitle className="text-base">{n.subject}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  Gerada {new Date(n.generated_at).toLocaleString("pt-PT")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setOpenId(n.id)}>
                    <Eye className="w-4 h-4 mr-1" /> Pré-visualizar
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {openId && full && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setOpenId(null)}
        >
          <div
            className="bg-card rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between gap-2">
              <h2 className="font-semibold truncate flex-1">{full.subject}</h2>
              <Button size="sm" variant="outline" onClick={() => copyHtml(full.html)}>
                <Copy className="w-4 h-4 mr-1" /> Copiar HTML
              </Button>
              <Button size="sm" variant="outline" onClick={() => downloadHtml(full.subject, full.html)}>
                <Download className="w-4 h-4 mr-1" /> Download
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpenId(null)}>
                Fechar
              </Button>
            </div>
            <iframe
              title="preview"
              srcDoc={full.html}
              className="flex-1 w-full border-0 rounded-b-lg bg-white"
            />
          </div>
        </div>
      )}
    </div>
  );
}
