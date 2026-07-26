import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAi, requireLovableApiKey } from "./ai-gateway.server";
import {
  renderNewsletterHtml,
  type NewsletterDocument,
  type NewsletterItemContent,
} from "./newsletter-html.server";

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

const SubsectionSchema = z.object({
  heading: z.string(),
  paragraph: z.string().optional(),
  bullets: z.array(z.string()).optional(),
});

const SectionSchema = z.object({
  icon: z.string().optional().describe("emoji único, ex: 🌿, 🫁, 💡, ✅"),
  heading: z.string(),
  paragraphs: z.array(z.string()).optional(),
  bullets: z.array(z.string()).optional(),
  subsections: z.array(SubsectionSchema).optional(),
});

const GuidelinesSchema = z.object({
  heading: z.string(),
  intro: z.string().optional(),
  items: z.array(z.string()),
});

const ItemContentSchema = z.object({
  overtitle: z
    .string()
    .optional()
    .describe("Kicker curto em maiúsculas (2-5 palavras), estilo 'NARIZ, PULMÕES E PRODUTIVIDADE'"),
  title: z.string().describe("H1 principal, curto e apelativo, frequentemente em forma de pergunta"),
  subtitle: z
    .string()
    .optional()
    .describe("Subtítulo curto que complementa o H1 (opcional)"),
  intro_paragraphs: z.array(z.string()).default([]),
  sections: z.array(SectionSchema).default([]),
  guidelines: GuidelinesSchema.optional().describe(
    "Preencher quando a notícia contém orientações, recomendações, medidas ou instruções claras. Deixar vazio caso a notícia seja meramente informativa sem orientações práticas.",
  ),
  closing_paragraph: z.string().optional(),
});

const SYSTEM_BASE = `És redator técnico da SEPRI Group (medicina e segurança no trabalho).
Tom: NEUTRO, INFORMATIVO e didático. A newsletter serve simultaneamente comunicação interna
(médicos, enfermeiros, técnicos, administrativos SEPRI) e externa (clientes e potenciais clientes).
NÃO uses linguagem promocional. NÃO uses "nós", "a nossa empresa", "contacte-nos".
Escreve em português europeu, com frases claras e curtas.

ESTRUTURA VISUAL DA NEWSLETTER SEPRI (obrigatória):
1. Overtitle curto em maiúsculas (kicker temático).
2. Título H1 forte, muitas vezes em forma de pergunta.
3. Subtítulo opcional que enquadra o tema.
4. 1 a 3 parágrafos de introdução que contextualizam.
5. 2 a 6 secções temáticas, cada uma com:
   - um emoji/icon relevante (🌿, 🫁, 💡, ✅, 🏥, 📋, etc.)
   - heading em forma de pergunta ou frase-chave
   - parágrafos e/ou bullet points curtos
   - opcionalmente subsecções agrupadas (heading em bold + bullets), tipo "Melhorar a qualidade do ar interior" com bullets debaixo.
6. Bloco de ORIENTAÇÕES destacado quando a notícia tem orientações, medidas, recomendações
   ou instruções claras. Este bloco lista instruções acionáveis, no imperativo, curtas.
7. Parágrafo de fecho que reforça a mensagem.

REGRA CRÍTICA: se a fonte contém orientações práticas explícitas
(ex: "as empresas devem…", "recomenda-se…", "medidas a adotar…", "procedimento…"),
preenche SEMPRE o campo guidelines com essas instruções tal como aparecem na fonte,
adaptadas para linguagem clara e imperativa. Se a notícia for meramente informativa
(uma publicação em Diário da República sem orientações operacionais, por exemplo),
deixa guidelines por preencher.`;

function fallbackItemContent(d: DetectionInput): NewsletterItemContent {
  const paragraphs = d.summary
    .split(/\n{2,}|\.\s+(?=[A-ZÀ-Ú])/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 4);
  return {
    title: d.title,
    intro_paragraphs: paragraphs.length ? paragraphs.slice(0, 2) : [d.summary],
    sections: paragraphs.length > 2
      ? [{ icon: "📌", heading: "Destaques", paragraphs: paragraphs.slice(2) }]
      : [],
    source_name: d.source_name,
    source_url: d.source_url,
    published_at: d.published_at ?? null,
  };
}

export async function generateNewsletterHtml(d: DetectionInput, chrome: ChromeInput) {
  const ai = createLovableAi(requireLovableApiKey());
  let subject = d.title.slice(0, 80);
  let content: NewsletterItemContent;
  try {
    const { output } = await generateText({
      model: ai(MODEL),
      output: Output.object({
        schema: z.object({
          subject: z.string().describe("Assunto Brevo, até 80 caracteres"),
          content: ItemContentSchema,
        }),
      }),
      system: SYSTEM_BASE,
      prompt: `Fonte: ${d.source_name}
Título detetado: ${d.title}
Resumo/conteúdo: ${d.summary}
${d.source_url ? `URL: ${d.source_url}` : ""}
${d.published_at ? `Publicado: ${d.published_at}` : ""}

Redige a newsletter completa seguindo a estrutura visual SEPRI.`,
    });
    subject = output.subject;
    content = {
      ...output.content,
      source_name: d.source_name,
      source_url: d.source_url,
      published_at: d.published_at ?? null,
    };
  } catch (err) {
    console.error("[newsletter-ai] generateNewsletterHtml fallback:", err);
    content = fallbackItemContent(d);
  }

  const doc: NewsletterDocument = { subject, items: [content] };
  const html = renderNewsletterHtml(doc, {
    logoUrl: chrome.logo_url,
    disclaimerHtml: chrome.disclaimer_html,
  });
  return { subject, html };
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
        subject: z.string().describe("Assunto Brevo único, até 80 caracteres, que resume o conjunto"),
        intro: z.object({
          overtitle: z.string().optional(),
          title: z.string(),
          lead: z.string(),
        }),
        items: z.array(ItemContentSchema).min(1),
      }),
    }),
    system: `${SYSTEM_BASE}

Vais redigir UMA newsletter que agrega várias atualizações. Escreve um bloco de introdução
comum (overtitle opcional, título H1 unificador e lead de 1-2 frases) e depois um bloco
completo para cada atualização, seguindo a mesma estrutura visual (overtitle, título,
subtítulo opcional, intro, secções com emojis, orientações quando aplicável, fecho).
Mantém a ordem original das atualizações.`,
    prompt: `Atualizações a incluir (pela ordem):

${items
  .map(
    (d, i) =>
      `#${i + 1} Fonte: ${d.source_name}
Título: ${d.title}
Resumo: ${d.summary}${d.source_url ? `\nURL: ${d.source_url}` : ""}${
        d.published_at ? `\nPublicado: ${d.published_at}` : ""
      }`,
  )
  .join("\n\n")}

Redige a newsletter agregada.`,
  });

  const enrichedItems: NewsletterItemContent[] = output.items.map((it, idx) => ({
    ...it,
    source_name: items[idx]?.source_name,
    source_url: items[idx]?.source_url ?? null,
    published_at: items[idx]?.published_at ?? null,
  }));

  const doc: NewsletterDocument = {
    subject: output.subject,
    composite_intro: output.intro,
    items: enrichedItems,
  };

  const html = renderNewsletterHtml(doc, {
    logoUrl: chrome.logo_url,
    disclaimerHtml: chrome.disclaimer_html,
  });

  return { subject: output.subject, html };
}
