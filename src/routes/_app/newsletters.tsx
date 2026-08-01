import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  listNewsletters,
  getNewsletter,
  getNewsletterDocx,
  updateNewsletterHtml,
} from "@/lib/detections.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Download, Eye, FileText, FileDown, Pencil, Save } from "lucide-react";

export const Route = createFileRoute("/_app/newsletters")({
  head: () => ({ meta: [{ title: "Newsletters · SEPRI" }] }),
  component: NewslettersPage,
});

function NewslettersPage() {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["newsletters"],
    queryFn: () => listNewsletters(),
  });
  const { data: full } = useQuery({
    queryKey: ["newsletter", openId],
    queryFn: () => getNewsletter({ data: { id: openId! } }),
    enabled: !!openId,
  });

  function closeModal() {
    const doc = iframeRef.current?.contentDocument;
    if (doc) doc.designMode = "off";
    setEditing(false);
    setOpenId(null);
  }

  async function copyHtml(html: string) {
    await navigator.clipboard.writeText(html);
    toast.success("HTML copiado");
  }

  function downloadHtml(subject: string, html: string) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${safeName(subject)}.html`;
    a.click();
  }

  async function downloadDocx(id: string) {
    toast.info("A preparar o Word...");
    try {
      const { subject, base64 } = await getNewsletterDocx({ data: { id } });
      const byteChars = atob(base64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: "application/msword" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName(subject)}.doc`;
      a.click();
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível gerar o Word.");
    }
  }

  async function downloadPdf(subject: string) {
    const body = iframeRef.current?.contentDocument?.body;
    if (!body) {
      toast.error("Pré-visualização ainda não está pronta.");
      return;
    }
    toast.info("A preparar o PDF...");
    // html2canvas (usado pelo html2pdf) não sabe interpretar cores oklch, e o
    // tema da app usa tokens oklch que se aplicam ao clone temporário.
    // Neutralizamos essas cores só durante a geração.
    const patch = document.createElement("style");
    patch.textContent = `html,body{background-color:#ffffff !important;color:#2b2b2b !important;}
*,*::before,*::after{border-color:#d5dbe0 !important;outline-color:#d5dbe0 !important;text-decoration-color:currentColor !important;}`;
    document.head.appendChild(patch);
    try {
      const { default: html2pdf } = await import("html2pdf.js");
      await html2pdf()
        .set({
          margin: 0,
          filename: `${safeName(subject)}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
        })
        .from(body)
        .save();

    } catch (err) {
      console.error(err);
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      patch.remove();
    }

  }

  function startEditing() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) {
      toast.error("Pré-visualização ainda não está pronta.");
      return;
    }
    doc.designMode = "on";
    setEditing(true);
  }

  async function saveEdits(id: string) {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    setSaving(true);
    try {
      const html = doc.documentElement.outerHTML;
      await updateNewsletterHtml({ data: { id, html } });
      doc.designMode = "off";
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ["newsletter", id] });
      toast.success("Alterações guardadas");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível guardar as alterações.");
    } finally {
      setSaving(false);
    }
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
          onClick={() => !editing && closeModal()}
        >
          <div
            className="bg-card rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-semibold truncate flex-1 min-w-40">{full.subject}</h2>

              {!editing && (
                <>
                  <Button size="sm" variant="outline" onClick={() => copyHtml(full.html)}>
                    <Copy className="w-4 h-4 mr-1" /> Copiar HTML
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadHtml(full.subject, full.html)}>
                    <Download className="w-4 h-4 mr-1" /> Download
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadDocx(full.id)}>
                    <FileText className="w-4 h-4 mr-1" /> Word
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadPdf(full.subject)}>
                    <FileDown className="w-4 h-4 mr-1" /> PDF
                  </Button>
                  <Button size="sm" variant="outline" onClick={startEditing}>
                    <Pencil className="w-4 h-4 mr-1" /> Editar
                  </Button>
                </>
              )}

              {editing && (
                <Button size="sm" disabled={saving} onClick={() => saveEdits(full.id)}>
                  <Save className="w-4 h-4 mr-1" /> {saving ? "A guardar…" : "Guardar alterações"}
                </Button>
              )}

              <Button size="sm" variant="ghost" onClick={closeModal} disabled={editing}>
                Fechar
              </Button>
            </div>

            {editing && (
              <div className="px-4 py-2 text-xs font-medium bg-primary/10 text-primary border-b">
                Modo de edição — clica no texto para alterar
              </div>
            )}

            <iframe
              ref={iframeRef}
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

function safeName(subject: string) {
  return subject.replace(/[^a-z0-9]+/gi, "-").slice(0, 60);
}
