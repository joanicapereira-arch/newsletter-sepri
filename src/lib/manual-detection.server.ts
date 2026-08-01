import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAi, requireLovableApiKey } from "./ai-gateway.server";
import { firecrawlScrape } from "./firecrawl.server";

const MODEL = "google/gemini-3-flash-preview";

export interface ExtractedArticle {
  title: string;
  summary: string;
  published_at: string | null;
  relevance_score: number;
}

/**
 * Extrai automaticamente título, resumo, data e relevância a partir do URL de
 * uma notícia indicada manualmente pelo utilizador.
 */
export async function extractArticleFromUrl(
  url: string,
  source: { name: string; keywords: string[] },
): Promise<ExtractedArticle> {
  let markdown = "";
  let metaTitle = "";
  try {
    const page = await firecrawlScrape(url, 400, 12000);
    markdown = (page?.markdown ?? "").slice(0, 12000);
    metaTitle = page?.metadata?.title ?? "";
  } catch (e) {
    console.error("[extractArticleFromUrl] scrape failed", e);
  }

  if (!markdown) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SEPRI-Monitor/1.0)" },
      });
      if (res.ok) {
        const html = await res.text();
        metaTitle =
          metaTitle || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
        markdown = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .slice(0, 12000);
      }
    } catch (e) {
      console.error("[extractArticleFromUrl] fetch fallback failed", e);
    }
  }

  if (!markdown.trim()) {
    throw new Error("Não foi possível ler o conteúdo desse URL. Verifica o endereço.");
  }

  const ai = createLovableAi(requireLovableApiKey());
  const { output } = await generateText({
    model: ai(MODEL),
    output: Output.object({
      schema: z.object({
        title: z.string(),
        summary: z.string(),
        published_at: z.string().nullable(),
        relevance_score: z.coerce.number().min(0).max(100),
      }),
    }),
    system: `És um analista da SEPRI Group (medicina e segurança no trabalho em Portugal).
Recebes o conteúdo de UMA página (notícia, diploma ou orientação) e devolves:
- title: o título real da notícia/diploma (em português, sem nome do site nem sufixos de navegação).
- summary: resumo objetivo de 2 a 4 frases, focado no impacto prático para medicina/segurança do trabalho, riscos psicossociais, formação obrigatória, autoproteção/incêndios, legionella e legislação aplicável.
- published_at: data de publicação em YYYY-MM-DD, ou null se não for possível inferir. Procura "Publicado em", "Data:", DD/MM/AAAA, "1 de janeiro de 2026"; para o Diário da República usa a data do diploma.
- relevance_score: 0-100 (100 = altamente crítico para a SEPRI).
Nunca inventes informação que não esteja no conteúdo.`,
    prompt: `Fonte: ${source.name}
Palavras-chave de interesse: ${source.keywords.join(", ")}
URL: ${url}
Título HTML (pode conter ruído): ${metaTitle}

Conteúdo:
---
${markdown}
---`,
  });

  const title = (output.title || metaTitle || url).trim().slice(0, 300);
  const published =
    output.published_at && /^\d{4}-\d{2}-\d{2}$/.test(output.published_at)
      ? output.published_at
      : null;

  return {
    title,
    summary: (output.summary || "").trim(),
    published_at: published,
    relevance_score: Math.round(output.relevance_score ?? 50),
  };
}
