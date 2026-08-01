import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAi, requireLovableApiKey } from "./ai-gateway.server";
import { firecrawlScrape } from "./firecrawl.server";
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
  intro_paragraphs: z.array(z.string()).min(1).describe("Pelo menos 1 parágrafo de introdução substancial (2-4 frases)."),
  sections: z.array(SectionSchema).min(2).describe(
    "No mínimo 2 secções desenvolvidas (ex: 'O que estabelece / Pontos-chave' e 'Impacto Direto na Saúde e Produtividade'). Cada secção deve ter parágrafo(s) e/ou bullets com conteúdo real, nunca frases vagas de uma linha.",
  ),
  guidelines: GuidelinesSchema.optional().describe(
    "Bloco de orientações práticas para a SEPRI dar aos seus clientes. Preenche SEMPRE que o tema permitir dar recomendações de saúde/segurança ocupacional (quase sempre) — mesmo que a fonte não as liste explicitamente, deriva 3-5 recomendações práticas e acionáveis coerentes com o tema, claramente como boas práticas recomendadas pela SEPRI (não como factos da fonte).",
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

REGRA CRÍTICA: a newsletter tem de ter CONTEÚDO SUBSTANCIAL. Nunca produzas uma newsletter
com apenas um título e uma frase — isso é um resultado inaceitável. Usa sempre o texto
completo do artigo fornecido (quando disponível) para escrever parágrafos e bullets
detalhados e específicos. Se o texto completo do artigo for fornecido, tens de o aproveitar
a fundo: extrai números, prazos, entidades, requisitos concretos mencionados nele.

Nos bullets podes usar **negrito** para destacar o rótulo antes do texto,
por exemplo: "**Picos de Absentismo:** baixas médicas prolongadas em equipas fulcrais."

ESTRUTURA OBRIGATÓRIA de cada newsletter (segue por esta ordem):
1. Overtitle no formato "IDENTIFICADOR | CATEGORIA" (ex: "PORTARIA N.º X | LEGISLAÇÃO & SAÚDE OCUPACIONAL",
   "DGS | SAÚDE OCUPACIONAL", "ACT | SEGURANÇA NO TRABALHO").
2. Título H1 orientado ao benefício empresarial (não apenas o nome da lei).
3. Subtítulo curto que refere o apoio SEPRI (opcional).
4. 1 a 2 parágrafos de introdução substanciais que contextualizam a novidade e o seu enquadramento.
5. Secção "O que estabelece / Pontos-chave" — bullets com **rótulo em negrito:** descrição,
   listando os aspetos concretos da notícia (medidas, prazos, quem abrange, etc.). Usa
   factos reais do texto completo do artigo sempre que disponível.
6. Secção "O Impacto Direto na Saúde e Produtividade das Empresas" (ou equivalente) —
   liga o tema aos custos e riscos operacionais: absentismo, presenteísmo, sobrecarga
   das equipas, acidentes de trabalho, custos indiretos.
7. Secção curta de enquadramento estratégico (uma frase que valoriza a prevenção como
   eficiência operacional).
8. Secção "Como a SEPRI pode ajudar a sua empresa" — bullets com serviços SEPRI
   relevantes ao tema (medicina do trabalho, campanhas de vacinação, avaliações de risco,
   ações de sensibilização, formação, gestão de absentismo, riscos psicossociais, etc.).
   Escolhe apenas serviços que fazem sentido para a notícia.
9. Bloco ORIENTAÇÕES destacado — preenche sempre que o tema permitir recomendações práticas
   (ver regra no schema).
10. Parágrafo de fecho curto que apela à ação.
11. CTA final com label em maiúsculas, ex: "PEÇA UMA PROPOSTA PERSONALIZADA",
    "AGENDE UMA REUNIÃO", "SAIBA MAIS".

Cada secção deve ter um ícone/emoji relevante (📋, 🏥, 💼, 📉, 🛡️, 💡, ✅, 🫁, 🌿, ⚖️, 📅…).
NÃO inventes números, estatísticas ou factos concretos que não constam da fonte — mas
as orientações/recomendações da SEPRI podem (e devem) ser conselhos profissionais
genuínos mesmo que não estejam escritos literalmente na fonte.`;

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

/** Vai buscar o texto completo do artigo via Firecrawl. Devolve null em caso de falha (não bloqueia o fluxo). */
async function fetchFullArticleText(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const scraped = await firecrawlScrape(url, 300, 9000);
    const md = scraped?.markdown?.trim();
    if (!md || md.length < 100) return null;
    return md.slice(0, 8000);
  } catch (err) {
    console.warn("[newsletter-ai] fetchFullArticleText falhou:", err);
    return null;
  }
}

function fallbackItemContent(d: DetectionInput, fullText?: string | null): NewsletterItemContent {
  const source = fullText && fullText.length > d.summary.length ? fullText : d.summary;
  const paragraphs = source
    .replace(/^#+\s.*$/gm, "")
    .split(/\n{2,}|\.\s+(?=[A-ZÀ-Ú])/)
    .map((p) => p.trim())
    .filter((p) => p.length > 20)
    .slice(0, 8);
  return {
    title: d.title,
    intro_paragraphs: paragraphs.length ? paragraphs.slice(0, 2) : [d.summary],
    sections: paragraphs.length > 2
      ? [{ icon: "📌", heading: "Destaques", paragraphs: paragraphs.slice(2, 6) }]
      : [],
    guidelines: {
      heading: "Recomendações da SEPRI",
      intro: "Enquanto aprofundamos este tema, deixamos algumas recomendações gerais de boas práticas:",
      items: [
        "**Avaliação de risco:** reveja periodicamente os riscos associados a esta área na sua empresa.",
        "**Formação e sensibilização:** informe as equipas sobre as implicações desta atualização.",
        "**Acompanhamento SEPRI:** contacte-nos para uma análise personalizada ao seu contexto.",
      ],
    },
    source_name: d.source_name,
    source_url: d.source_url,
    published_at: d.published_at ?? null,
  };
}

async function generateItemContent(
  d: DetectionInput,
  fullText: string | null,
): Promise<{ subject: string; content: NewsletterItemContent } | null> {
  const ai = createLovableAi(requireLovableApiKey());
  const prompt = `Fonte: ${d.source_name}
Título detetado: ${d.title}
Resumo curto: ${d.summary}
${d.source_url ? `URL: ${d.source_url}` : ""}
${d.published_at ? `Publicado: ${d.published_at}` : ""}
${fullText ? `\nTEXTO COMPLETO DO ARTIGO (usa isto como fonte principal de factos):\n${fullText}` : "\n(Texto completo do artigo não disponível — usa apenas o resumo curto, mas ainda assim produz secções com conteúdo desenvolvido e orientações práticas relevantes ao tema.)"}

Redige a newsletter completa seguindo a estrutura visual SEPRI. Não te limites ao resumo curto — desenvolve cada secção com substância.`;

  for (let attempt = 1; attempt <= 2; attempt++) {
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
        prompt,
      });
      return {
        subject: output.subject,
        content: {
          ...mapAiContent(output.content),
          source_name: d.source_name,
          source_url: d.source_url,
          published_at: d.published_at ?? null,
        },
      };
    } catch (err) {
      console.error(`[newsletter-ai] generateItemContent tentativa ${attempt} falhou:`, err);
      if (attempt === 2) return null;
    }
  }
  return null;
}

export async function generateNewsletterHtml(d: DetectionInput, chrome: ChromeInput) {
  const fullText = await fetchFullArticleText(d.source_url);
  const result = await generateItemContent(d, fullText);
  const subject = result?.subject ?? d.title.slice(0, 80);
  const content = result?.content ?? fallbackItemContent(d, fullText);

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
  const fullTexts = await Promise.all(items.map((it) => fetchFullArticleText(it.source_url)));

  let subject = items.length === 1 ? items[0].title.slice(0, 80) : "Atualizações SEPRI";
  let intro: NewsletterDocument["composite_intro"] | undefined;
  let enrichedItems: NewsletterItemContent[];

  try {
    const LooseSchema = z.object({
      subject: z.string().optional(),
      intro: z.any().optional(),
      items: z.array(z.any()).min(1),
    });
    const { output } = await generateText({
      model: ai(MODEL),
      output: Output.object({ schema: LooseSchema }),
      system: `${SYSTEM_BASE}

Vais redigir UMA newsletter que agrega várias atualizações. Devolve SEMPRE um único objeto
JSON com as chaves "subject", "intro" (objeto com overtitle opcional, title, lead) e "items"
— nunca devolvas um array na raiz. Cada item segue o schema: overtitle, title, subtitle,
intro_paragraphs (array de strings), sections (array com heading, icon, paragraphs, bullets),
guidelines (heading, intro, items), closing_paragraph, cta (label, url).
Mantém a ordem original das atualizações. Usa sempre o texto completo do artigo fornecido
para cada atualização, quando disponível.`,
      prompt: `Atualizações a incluir (pela ordem):
${items
  .map(
    (d, i) =>
      `#${i + 1} Fonte: ${d.source_name}
Título: ${d.title}
Resumo curto: ${d.summary}${d.source_url ? `\nURL: ${d.source_url}` : ""}${
        d.published_at ? `\nPublicado: ${d.published_at}` : ""
      }${fullTexts[i] ? `\nTEXTO COMPLETO DO ARTIGO #${i + 1}:\n${fullTexts[i]}` : ""}`,
  )
  .join("\n\n")}

Redige a newsletter agregada, desenvolvendo cada atualização com substância real.`,
    });

    const normalized = output.items.map((raw) => normalizeLooseItem(raw));
    if (normalized.every((it) => it.sections.length === 0)) throw new Error("conteúdo insuficiente");

    subject = output.subject?.trim() || subject;
    intro = normalizeLooseIntro(output.intro, items);
    enrichedItems = normalized.map((it, idx) => ({
      ...it,
      source_name: items[idx]?.source_name,
      source_url: items[idx]?.source_url ?? null,
      published_at: items[idx]?.published_at ?? null,
    }));
    for (let i = enrichedItems.length; i < items.length; i++) {
      enrichedItems.push(fallbackItemContent(items[i], fullTexts[i]));
    }
  } catch (err) {

    console.error("[newsletter-ai] generateCombinedNewsletterHtml fallback:", err);
    enrichedItems = items.map((it, idx) => fallbackItemContent(it, fullTexts[idx]));
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
