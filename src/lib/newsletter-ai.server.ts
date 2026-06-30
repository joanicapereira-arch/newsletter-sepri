import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAi, requireLovableApiKey } from "./ai-gateway.server";
import { renderNewsletterHtml } from "./newsletter-html.server";

const MODEL = "google/gemini-3-flash-preview";

interface DetectionInput {
  title: string;
  summary: string;
  source_name: string;
  source_url: string | null;
}

interface ChromeInput {
  logo_url: string;
  disclaimer_html: string;
}

export async function generateNewsletterHtml(d: DetectionInput, chrome: ChromeInput) {
  const ai = createLovableAi(requireLovableApiKey());
  const { output } = await generateText({
    model: ai(MODEL),
    output: Output.object({
      schema: z.object({
        subject: z.string(),
        title: z.string(),
        lead: z.string(),
        body_paragraphs: z.array(z.string()).min(2).max(8),
      }),
    }),
    system: `És redator técnico da SEPRI Group (medicina e segurança no trabalho).
Tom: estritamente NEUTRO e INFORMATIVO. A mesma versão serve para comunicação interna
(médicos, enfermeiros, técnicos, administrativos SEPRI) e externa (clientes e potenciais clientes).
NÃO uses linguagem promocional, NÃO menciones "nós", "a nossa empresa", "contacte-nos".
Escreves em português europeu.

Devolve:
- subject: linha de assunto Brevo (até 80 caracteres)
- title: H1 da newsletter, claro e apelativo
- lead: parágrafo de abertura forte e resumido (1-2 frases) para leitura rápida
- body_paragraphs: 2 a 6 parágrafos de desenvolvimento neutro, factual, com detalhes da atualização legislativa ou técnica`,
    prompt: `Fonte: ${d.source_name}
Tema detetado: ${d.title}
Resumo: ${d.summary}
${d.source_url ? `URL: ${d.source_url}` : ""}

Redige a newsletter.`,
  });

  const bodyHtml = output.body_paragraphs
    .map((p) => `<p style="margin:0 0 14px;">${escapeHtml(p)}</p>`)
    .join("\n");

  const html = renderNewsletterHtml(
    {
      subject: output.subject,
      title: output.title,
      lead: output.lead,
      bodyHtml,
      sourceUrl: d.source_url ?? undefined,
    },
    { logoUrl: chrome.logo_url, disclaimerHtml: chrome.disclaimer_html },
  );

  return { subject: output.subject, html };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
