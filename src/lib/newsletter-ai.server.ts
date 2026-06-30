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
  published_at?: string | null;
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
      publishedAt: d.published_at ?? undefined,
    },
    { logoUrl: chrome.logo_url, disclaimerHtml: chrome.disclaimer_html },
  );

  return { subject: output.subject, html };
}

export async function generateCombinedNewsletterHtml(
  items: DetectionInput[],
  chrome: ChromeInput,
) {
  const ai = createLovableAi(requireLovableApiKey());
  const { output } = await generateText({
    model: ai(MODEL),
    output: Output.object({
      schema: z.object({
        subject: z.string(),
        intro_title: z.string(),
        intro_lead: z.string(),
        items: z
          .array(
            z.object({
              title: z.string(),
              lead: z.string(),
              body_paragraphs: z.array(z.string()).min(1).max(5),
            }),
          )
          .min(1),
      }),
    }),
    system: `És redator técnico da SEPRI Group (medicina e segurança no trabalho).
Tom: estritamente NEUTRO e INFORMATIVO. Serve comunicação interna e externa.
NÃO uses linguagem promocional, NÃO menciones "nós", "a nossa empresa", "contacte-nos".
Português europeu.

Vais redigir UMA newsletter que agrega várias atualizações legislativas/técnicas.
Devolve:
- subject: assunto Brevo único (até 80 caracteres) que resume o conjunto
- intro_title: H1 da newsletter
- intro_lead: 1-2 frases a enquadrar o conjunto de novidades
- items: para cada atualização recebida, um objeto { title, lead, body_paragraphs (1-4 parágrafos) }, na MESMA ORDEM em que foram dadas`,
    prompt: `Atualizações a incluir (pela ordem):\n\n${items
      .map(
        (d, i) =>
          `#${i + 1} Fonte: ${d.source_name}\nTítulo: ${d.title}\nResumo: ${d.summary}${
            d.source_url ? `\nURL: ${d.source_url}` : ""
          }${d.published_at ? `\nPublicado: ${d.published_at}` : ""}`,
      )
      .join("\n\n")}\n\nRedige a newsletter agregada.`,
  });

  const sectionsHtml = output.items
    .map((it, idx) => {
      const src = items[idx];
      const bodyHtml = it.body_paragraphs
        .map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#1e293b;">${escapeHtml(p)}</p>`)
        .join("\n");
      const pubLine = src?.published_at
        ? `<p style="font-size:13px;color:#64748b;margin:0 0 10px;">Publicado em ${escapeHtml(
            new Date(src.published_at).toLocaleDateString("pt-PT"),
          )} · Fonte: ${escapeHtml(src.source_name)}</p>`
        : `<p style="font-size:13px;color:#64748b;margin:0 0 10px;">Fonte: ${escapeHtml(src?.source_name ?? "")}</p>`;
      const srcLink = src?.source_url
        ? `<p style="font-size:13px;margin:8px 0 0;"><a href="${escapeHtml(src.source_url)}" style="color:#0f5e8f;">Ler na fonte original →</a></p>`
        : "";
      return `<div style="padding:24px 0;${idx > 0 ? "border-top:1px solid #e2e8f0;" : ""}">
        <h2 style="font-size:19px;line-height:1.35;margin:0 0 6px;color:#0f172a;">${escapeHtml(it.title)}</h2>
        ${pubLine}
        <p style="font-size:16px;line-height:1.5;font-weight:600;color:#0f5e8f;margin:0 0 12px;">${escapeHtml(it.lead)}</p>
        ${bodyHtml}
        ${srcLink}
      </div>`;
    })
    .join("\n");

  const introBlock = `<h1 style="font-size:24px;line-height:1.3;margin:0 0 8px;color:#0f172a;">${escapeHtml(
    output.intro_title,
  )}</h1>
<p style="font-size:16px;line-height:1.55;color:#334155;margin:0 0 8px;">${escapeHtml(output.intro_lead)}</p>`;

  const html = renderNewsletterHtml(
    {
      subject: output.subject,
      title: "",
      lead: "",
      bodyHtml: introBlock + sectionsHtml,
      composite: true,
    },
    { logoUrl: chrome.logo_url, disclaimerHtml: chrome.disclaimer_html },
  );

  return { subject: output.subject, html };
}

