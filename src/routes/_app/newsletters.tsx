import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  listNewsletters,
  getNewsletter,
  updateNewsletterHtml,
  uploadNewsletterImage,
} from "@/lib/detections.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Download,
  Eye,
  FileDown,
  Pencil,
  Save,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Image as ImageIcon,
} from "lucide-react";

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);

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

  async function downloadPdf(subject: string) {
    const doc = iframeRef.current?.contentDocument;
    const target =
      (doc?.querySelector("body > table td > table") as HTMLElement | null) ?? doc?.body ?? null;
    if (!doc || !target) {
      toast.error("Pré-visualização ainda não está pronta.");
      return;
    }
    toast.info("A preparar o PDF...");
    // html2canvas clona o elemento para dentro deste documento, por isso os
    // tokens oklch e os efeitos decorativos do tema da app aplicam-se ao clone.
    // Neutralizamos tudo isso só durante a captura.
    const patch = document.createElement("style");
    patch.textContent = `html,body{background-color:#ffffff !important;color:#2b2b2b !important;}
*,*::before,*::after{border-color:#d5dbe0 !important;outline-color:#d5dbe0 !important;text-decoration-color:currentColor !important;}`;
    document.head.appendChild(patch);
    // html2canvas não desenha ::marker, por isso injetamos bullets reais.
    const injected: HTMLElement[] = [];
    doc.querySelectorAll("li").forEach((li) => {
      const dot = doc.createElement("span");
      dot.setAttribute("data-pdf-bullet", "1");
      dot.textContent = "• ";
      li.insertBefore(dot, li.firstChild);
      injected.push(dot);
    });
    // Limpa a seleção do editor para o realce não ser capturado na imagem.
    doc.getSelection()?.removeAllRanges();
    window.getSelection()?.removeAllRanges();
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(target, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        onclone: (clonedDoc: Document) => {
          const style = clonedDoc.createElement("style");
          // Sem list-style nativo, sem sombras/filtros/gradientes herdados do
          // tema da app (origem das "manchas" cinzentas desfocadas) e sem
          // pseudo-elementos decorativos.
          style.textContent = `li{list-style:none !important;}
*{box-shadow:none !important;filter:none !important;text-shadow:none !important;background-image:none !important;mix-blend-mode:normal !important;opacity:1 !important;}
*::before,*::after{box-shadow:none !important;filter:none !important;background-image:none !important;}
::selection{background:transparent !important;}`;
          clonedDoc.head.appendChild(style);
        },
      });

      const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const maxW = pageW - margin * 2;
      // Ocupa toda a largura útil e fica centrado por construção.
      const imgW = maxW;
      const offsetX = (pageW - imgW) / 2;
      const usableH = pageH - margin * 2;

      const pageCanvas = document.createElement("canvas");
      const ctx = pageCanvas.getContext("2d")!;
      const sliceHpx = Math.floor((usableH * canvas.width) / imgW);
      // Para não cortar linhas de texto a meio, procuramos uma faixa horizontal
      // "vazia" (uniforme) perto do fim da página e cortamos aí.
      const srcCtx = canvas.getContext("2d");
      console.log("PDFSLICE v2 active", !!srcCtx);
      const isBlankRow = (row: number) => {
        if (!srcCtx) return false;
        const d = srcCtx.getImageData(0, row, canvas.width, 1).data;
        const r0 = d[0]!, g0 = d[1]!, b0 = d[2]!;
        for (let i = 4; i < d.length; i += 4) {
          if (
            Math.abs(d[i]! - r0) > 6 ||
            Math.abs(d[i + 1]! - g0) > 6 ||
            Math.abs(d[i + 2]! - b0) > 6
          )
            return false;
        }
        return true;
      };
      let y = 0;
      let page = 0;
      while (y < canvas.height) {
        let h = Math.min(sliceHpx, canvas.height - y);
        if (y + h < canvas.height) {
          const minH = Math.floor(h * 0.85);
          for (let cut = h; cut >= minH; cut -= 2) {
            if (isBlankRow(y + cut - 1)) {
              h = cut;
              break;
            }
          }
        }
        pageCanvas.width = canvas.width;
        pageCanvas.height = h;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, h);
        ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
        if (page > 0) pdf.addPage();
        pdf.addImage(
          pageCanvas.toDataURL("image/jpeg", 0.95),
          "JPEG",
          offsetX,
          margin,
          imgW,
          (h * imgW) / canvas.width,
        );
        y += h;
        page += 1;
      }

      pdf.save(`${safeName(subject)}.pdf`);
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      injected.forEach((el) => el.remove());
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

  function saveSelection() {
    const doc = iframeRef.current?.contentDocument;
    const sel = doc?.getSelection();
    if (sel && sel.rangeCount > 0) savedRangeRef.current = sel.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    const doc = iframeRef.current?.contentDocument;
    const sel = doc?.getSelection();
    const range = savedRangeRef.current;
    if (sel && range) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function exec(command: string, value?: string) {
    const win = iframeRef.current?.contentWindow;
    const doc = iframeRef.current?.contentDocument;
    if (!win || !doc) return;
    win.focus();
    doc.execCommand(command, false, value);
  }

  function execWithSavedSelection(command: string, value?: string) {
    restoreSelection();
    exec(command, value);
  }

  async function handleImageFile(file: File) {
    const toastId = toast.loading("A enviar imagem...");
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
      const { url } = await uploadNewsletterImage({
        data: {
          filename: file.name,
          content_type: file.type || "image/png",
          base64: btoa(binary),
        },
      });
      execWithSavedSelection("insertImage", url);
      toast.success("Imagem inserida", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível enviar a imagem.", { id: toastId });
    }
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
            className="bg-card rounded-lg w-full max-w-5xl h-[95vh] max-h-[95vh] flex flex-col overflow-hidden"
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
              <>
                <div
                  className="flex flex-wrap items-center gap-1 px-3 py-2 border-b bg-muted/40"
                  onMouseDown={(e) => {
                    const el = e.target as HTMLElement;
                    if (el.closest("select") || el.closest("input")) return;
                    saveSelection();
                    e.preventDefault();
                  }}
                >
                  <Button size="sm" variant="ghost" aria-label="Negrito" onClick={() => exec("bold")}>
                    <Bold className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Itálico" onClick={() => exec("italic")}>
                    <Italic className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Sublinhado" onClick={() => exec("underline")}>
                    <Underline className="w-4 h-4" />
                  </Button>
                  <span className="w-px h-6 bg-border mx-1" />
                  <Button size="sm" variant="ghost" aria-label="Alinhar à esquerda" onClick={() => exec("justifyLeft")}>
                    <AlignLeft className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Centrar" onClick={() => exec("justifyCenter")}>
                    <AlignCenter className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Alinhar à direita" onClick={() => exec("justifyRight")}>
                    <AlignRight className="w-4 h-4" />
                  </Button>
                  <span className="w-px h-6 bg-border mx-1" />
                  <label className="flex items-center gap-1 text-xs">
                    Cor
                    <input
                      type="color"
                      aria-label="Cor do texto"
                      defaultValue="#2b2b2b"
                      className="h-7 w-9 rounded border bg-background p-0"
                      onChange={(e) => exec("foreColor", e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Tipo de letra"
                    defaultValue=""
                    className="h-8 rounded border bg-background text-xs px-2"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      saveSelection();
                    }}
                    onFocus={saveSelection}
                    onChange={(e) => e.target.value && execWithSavedSelection("fontName", e.target.value)}
                  >
                    <option value="">Tipo de letra</option>
                    <option value="Arial">Arial</option>
                    <option value="Helvetica">Helvetica</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Verdana">Verdana</option>
                  </select>
                  <select
                    aria-label="Tamanho de letra"
                    defaultValue=""
                    className="h-8 rounded border bg-background text-xs px-2"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      saveSelection();
                    }}
                    onFocus={saveSelection}
                    onChange={(e) => e.target.value && execWithSavedSelection("fontSize", e.target.value)}
                  >
                    <option value="">Tamanho</option>
                    <option value="1">Pequeno</option>
                    <option value="2">Normal</option>
                    <option value="3">Médio</option>
                    <option value="4">Grande</option>
                    <option value="5">Maior</option>
                    <option value="6">Enorme</option>
                    <option value="7">Máximo</option>
                  </select>
                  <span className="w-px h-6 bg-border mx-1" />
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Inserir imagem"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImageIcon className="w-4 h-4 mr-1" /> Imagem
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void handleImageFile(file);
                    }}
                  />
                </div>
                <div className="px-4 py-2 text-xs font-medium bg-primary/10 text-primary border-b">
                  Modo de edição — seleciona o texto e usa a barra acima. Para trocar uma imagem, seleciona-a e clica em “Imagem”.
                </div>
              </>
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
