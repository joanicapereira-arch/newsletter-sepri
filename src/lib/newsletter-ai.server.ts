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

const ResourceSchema = z.object({
  heading: z.string().describe(
    "Título do bloco de destaque, ex: 'Descarregue o nosso panfleto informativo' ou 'Descarregue o documento relacionado'",
  ),
  image_url: z.string().optional().describe("Deixa vazio — a imagem é adicionada manualmente pela Eliana antes do envio."),
  link_url: z.string().optional().describe("URL do documento/recurso a descarregar, se mencionado na fonte."),
});

const CtaSchema = z.object({
  label: z.string().describe("Texto do botão em maiúsculas, ex: 'PEÇA UMA PROPOSTA PERSONALIZADA'"),
  url: z.string().optional().describe("URL opcional; se vazio, usa contactos SEPRI"),
});

const ItemContentSchema = z.object({
  overtitle: z
    .string()
    .optional()
    .describe(
      "Kicker em maiúsculas no formato 'IDENTIFICADOR | CATEGORIA', ex: 'PORTARIA N.º 283/2026 | LEGISLAÇÃO & SAÚDE OCUPACIONAL' ou 'DGS | SAÚDE OCUPACIONAL'",
    ),
  title: z
    .string()
    .describe(
      "H1 orientado ao benefício para a empresa cliente, ex: 'Campanha de Vacinação Sazonal 2026-2027: o que a sua empresa precisa de saber'",
    ),
  subtitle: z
    .string()
    .optional()
    .describe("Subtítulo curto que enquadra o tema e menciona o apoio SEPRI (opcional)"),
  intro_paragraphs: z.array(z.string()).default([]),
  sections: z.array(SectionSchema).default([]),
  guidelines: GuidelinesSchema.optional().describe(
    "Preencher quando a notícia contém orientações, recomendações, medidas ou instruções claras.",
  ),
  resource: ResourceSchema.optional().describe(
    "Preencher APENAS quando a notícia/fonte menciona explicitamente um documento, panfleto, guia ou material para descarregar. Não inventes um recurso quando a fonte não o tem.",
  ),
  closing_paragraph: z.string().optional().describe("Parágrafo curto que convida à ação antes do CTA."),
  cta: CtaSchema.optional().describe(
    "Botão final. Preencher SEMPRE que a newsletter promove um serviço SEPRI (quase sempre).",
  ),
});

const SYSTEM_BASE = `És redator de marketing técnico da SEPRI Group (medicina no trabalho e saúde ocupacional).
A newsletter serve dois públicos em simultâneo: comunicação interna e comunicação para
CLIENTES E POTENCIAIS CLIENTES da SEPRI. O tom é profissional e informativo MAS orientado
ao negócio: mostra sempre como o tema afeta as empresas e como a SEPRI pode apoiar.
Podes usar "a sua empresa", "as suas equipas", "os seus colaboradores". Podes usar "a SEPRI",
"na SEPRI, promovemos...", "disponibilizamos". Escreve em português europeu.

Nos bullets podes usar **negrito** para destacar o rótulo antes do texto,
por exemplo: "**Picos de Absentismo:** baixas médicas prolongadas em equipas fulcrais."

ESTRUTURA OBRIGATÓRIA de cada newsletter (segue por esta ordem):
1. Overtitle no formato "IDENTIFICADOR | CATEGORIA" (ex: "PORTARIA N.º X | LEGISLAÇÃO & SAÚDE OCUPACIONAL",
   "DGS | SAÚDE OCUPACIONAL", "ACT | SEGURANÇA NO TRABALHO").
2. Título H1 orientado ao benefício empresarial (não apenas o nome da lei).
3. Subtítulo curto que refere o apoio SEPRI (opcional).
4. 1 a 2 parágrafos de introdução que contextualizam a novidade e o seu enquadramento.
5. Secção "O que estabelece / Pontos-chave" — bullets com **rótulo em negrito:** descrição,
   listando os aspetos concretos da notícia (medidas, prazos, quem abrange, etc.).
6. Secção "O Impacto Direto na Saúde e Produtividade das Empresas" (ou equivalente) —
   liga o tema aos custos e riscos operacionais: absentismo, presenteísmo, sobrecarga
   das equipas, acidentes de trabalho, custos indiretos.
7. Secção curta de enquadramento estratégico (uma frase que valoriza a prevenção como
   eficiência operacional).
8. Secção "Como a SEPRI pode ajudar a sua empresa" — bullets com serviços SEPRI
   relevantes ao tema (medicina do trabalho, campanhas de vacinação, avaliações de risco,
   ações de sensibilização, formação, gestão de absentismo, riscos psicossociais, etc.).
   Escolhe apenas serviços que fazem sentido para a notícia.
9. Bloco ORIENTAÇÕES destacado APENAS quando a fonte traz recomendações práticas explícitas
   (imperativo, curto, acionável).
10. Parágrafo de fecho curto que apela à ação.
11. CTA final com label em maiúsculas, ex: "PEÇA UMA PROPOSTA PERSONALIZADA",
    "AGENDE UMA REUNIÃO", "SAIBA MAIS".

Cada secção deve ter um ícone/emoji relevante (📋, 🏥, 💼, 📉, 🛡️, 💡, ✅, 🫁, 🌿, ⚖️, 📅…).
NÃO inventes números, estatísticas ou factos que não constam da fonte.`;

function mapResource(raw: { heading: string; image_url?: string; link_url?: string } | undefined) {
  if (!raw) return undefined;
  return {
    heading: raw.heading,
    imageUrl: raw.image_url || undefined,
    linkUrl: raw.link_url || undefined,
  };
}

function mapAiContent<T extends { resource?: { heading: string; image_url?: string; link_url?: string } }>(
  raw: T,
): Omit<T, "resource"> & { resource?: ReturnType<typeof mapResource> } {
  const { resource, ...rest } = raw;
  return { ...rest, resource: mapResource(resource) };
}

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
      ...mapAiContent(output.content),
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
  let subject = items.length === 1 ? items[0].title.slice(0, 80) : "Atualizações SEPRI";
  let intro: NewsletterDocument["composite_intro"] | undefined;
  let enrichedItems: NewsletterItemContent[];

  try {
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
    subject = output.subject;
    intro = output.intro;
    enrichedItems = output.items.map((it, idx) => ({
      ...mapAiContent(it),
      source_name: items[idx]?.source_name,
      source_url: items[idx]?.source_url ?? null,
      published_at: items[idx]?.published_at ?? null,
    }));
    for (let i = enrichedItems.length; i < items.length; i++) {
      enrichedItems.push(fallbackItemContent(items[i]));
    }
  } catch (err) {
    console.error("[newsletter-ai] generateCombinedNewsletterHtml fallback:", err);
    enrichedItems = items.map(fallbackItemContent);
    intro = items.length > 1
      ? { title: "Atualizações SEPRI", lead: "Resumo das últimas atualizações relevantes." }
      : undefined;
  }

  const doc: NewsletterDocument = {
    subject,
    composite_intro: intro,
    items: enrichedItems,
  };
  const html = renderNewsletterHtml(doc, {
    logoUrl: chrome.logo_url,
    disclaimerHtml: chrome.disclaimer_html,
  });
  return { subject, html };
}
