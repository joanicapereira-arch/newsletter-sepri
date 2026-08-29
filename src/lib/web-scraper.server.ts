// Scraper direto (fetch + cheerio), sem depender de um serviço externo pago (Firecrawl).
// Mantém a mesma interface pública que o antigo firecrawl.server.ts para minimizar
// alterações nos ficheiros que o consomem (scan.functions.ts, newsletter-ai.server.ts,
// manual-detection.server.ts).

import * as cheerio from "cheerio";

const UA = "Mozilla/5.0 (compatible; SEPRI-Monitor/1.0; +https://sepri.pt)";

export interface ScrapeResult {
  markdown?: string; // texto limpo da página (o nome "markdown" mantém-se por compatibilidade — é texto simples, não markdown real)
  links?: string[];
  metadata?: { title?: string; sourceURL?: string; statusCode?: number };
}

export interface LinkRef {
  text: string;
  url: string;
}

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function fetchHtml(url: string, timeoutMs = 9000): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: timeoutSignal(timeoutMs),
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) return null;
    const html = await res.text();
    return { html, finalUrl: res.url || url };
  } catch {
    return null;
  }
}

function extractContentAndLinks(html: string, baseUrl: string): { text: string; title: string; links: LinkRef[] } {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, header, footer, form, iframe").remove();
  const title = ($("title").first().text() || "").trim();

  const links: LinkRef[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!href || !text || text.length < 3) return;
    try {
      const abs = new URL(href, baseUrl).toString();
      if (!/^https?:\/\//i.test(abs)) return;
      if (seen.has(abs)) return;
      seen.add(abs);
      links.push({ text, url: abs });
    } catch {
      /* URL inválido, ignora */
    }
  });

  const root = $("main").length ? $("main") : $("article").length ? $("article") : $("body");
  const text = root
    .text()
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, title, links };
}

/** Faz scrape de uma única página. Substitui a chamada anterior à API da Firecrawl. */
export async function scrapePage(url: string, _waitFor = 250, timeoutMs = 9000): Promise<ScrapeResult | null> {
  const fetched = await fetchHtml(url, timeoutMs);
  if (!fetched) return null;
  const { text, title } = extractContentAndLinks(fetched.html, fetched.finalUrl);
  if (!text) return null;
  return {
    markdown: text,
    metadata: { title, sourceURL: fetched.finalUrl, statusCode: 200 },
  };
}

/** Nome mantido por compatibilidade com o código existente. */
export const firecrawlScrape = scrapePage;

/**
 * Faz scraping mais profundo: página principal + páginas candidatas a notícias
 * descobertas a partir dos próprios links da página raiz (substitui o antigo
 * endpoint /map da Firecrawl, que fazia uma descoberta equivalente via sitemap).
 */
export async function firecrawlDeepScrape(
  rootUrl: string,
  opts: { maxPages?: number; perPageChars?: number } = {},
): Promise<{ markdown: string; pages: number; links: LinkRef[] }> {
  const maxPages = opts.maxPages ?? 0;
  const perPageChars = opts.perPageChars ?? 3500;

  const rootFetch = await fetchHtml(rootUrl, 9000);
  if (!rootFetch) return { markdown: "", pages: 0, links: [] };

  const { text: rootText, links: rootLinks } = extractContentAndLinks(rootFetch.html, rootFetch.finalUrl);

  const parts: string[] = [];
  if (rootText) parts.push(`# Fonte raiz: ${rootUrl}\n\n${rootText.slice(0, perPageChars * 2)}`);

  const year = new Date().getFullYear();
  const yearPattern = new RegExp(`(${year}|${year - 1})`);
  const newsPattern =
    /(noticia|news|comunicado|press|legisla|circular|diploma|despacho|portaria|aviso|orientac|alerta|publicac)/i;
  const rootNorm = rootUrl.replace(/\/$/, "");

  const scored = rootLinks
    .filter((l) => l.url.replace(/\/$/, "") !== rootNorm)
    .map((l) => {
      const decoded = decodeURIComponent(l.url).toLowerCase();
      const score = (yearPattern.test(decoded) ? 3 : 0) + (newsPattern.test(decoded) ? 5 : 0);
      return { ...l, score };
    })
    .filter((l) => l.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length) {
    parts.push(
      `\n\n---\n# URLs candidatas recentes/temáticas\n\n${scored
        .slice(0, 40)
        .map((s) => s.url)
        .join("\n")}`,
    );
  }

  const finalList = scored.slice(0, maxPages).map((s) => s.url);

  const subPages = await Promise.all(
    finalList.map(async (u) => {
      const fetched = await fetchHtml(u, 7000);
      if (!fetched) return null;
      const { text, links } = extractContentAndLinks(fetched.html, fetched.finalUrl);
      return { u, text, links };
    }),
  );

  let pages = rootText ? 1 : 0;
  const linkPool: LinkRef[] = [...rootLinks];
  for (const sub of subPages) {
    if (sub?.text) {
      parts.push(`\n\n---\n# ${sub.u}\n\n${sub.text.slice(0, perPageChars)}`);
      linkPool.push(...sub.links);
      pages++;
    }
  }

  const seen = new Set<string>();
  const links = linkPool.filter((l) => (seen.has(l.url) ? false : (seen.add(l.url), true)));

  return { markdown: parts.join("\n"), pages, links };
}

const STOP = new Set([
  "de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "em", "no", "na", "nos", "nas", "para", "por", "com",
  "um", "uma", "the", "of", "and", "to", "in", "on", "at", "for", "nº", "º", "ª",
]);

function tokens(s: string): Set<string> {
  const norm = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const parts = norm.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
  return new Set(parts);
}

/**
 * Devolve os melhores candidatos a URL específica para um título, ordenados
 * por relevância (overlap de tokens entre o título e o texto da hiperligação).
 */
export function resolveUrlCandidatesForTitle(
  title: string,
  links: LinkRef[],
  rootUrl: string,
  opts: { minScore?: number; limit?: number } = {},
): string[] {
  const minScore = opts.minScore ?? 0.35;
  const limit = opts.limit ?? 3;
  const rootNorm = rootUrl.replace(/\/$/, "");
  const tw = tokens(title);
  if (tw.size < 2) return [];
  const scored: { score: number; url: string }[] = [];
  const seenUrls = new Set<string>();
  for (const l of links) {
    if (!l.url || l.url.replace(/\/$/, "") === rootNorm) continue;
    if (seenUrls.has(l.url)) continue;
    const lw = tokens(l.text);
    if (!lw.size) continue;
    let overlap = 0;
    for (const w of tw) if (lw.has(w)) overlap++;
    const score = overlap / tw.size;
    if (score >= minScore) {
      scored.push({ score, url: l.url });
      seenUrls.add(l.url);
    }
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.url);
}

/** @deprecated usa resolveUrlCandidatesForTitle — mantido para compatibilidade. */
export function resolveUrlForTitle(title: string, links: LinkRef[], rootUrl: string): string | null {
  return resolveUrlCandidatesForTitle(title, links, rootUrl, { minScore: 0.45, limit: 1 })[0] ?? null;
}

/**
 * Confirma que uma URL candidata a "link específico da notícia" é válida:
 * responde com sucesso e o conteúdo tem sobreposição de vocabulário com o título.
 * Devolve a URL final (após redirects) se válida, ou null caso contrário.
 */
export async function verifyArticleUrl(url: string, title: string, timeoutMs = 7000): Promise<string | null> {
  const fetched = await fetchHtml(url, timeoutMs);
  if (!fetched) return null;
  const { text } = extractContentAndLinks(fetched.html, fetched.finalUrl);

  const pageTokens = tokens(text.slice(0, 6000));
  const titleTokens = tokens(title);
  if (titleTokens.size === 0) return fetched.finalUrl;
  let overlap = 0;
  for (const t of titleTokens) if (pageTokens.has(t)) overlap++;
  const ratio = overlap / titleTokens.size;
  if (ratio >= 0.25 || overlap >= 2) return fetched.finalUrl;
  return null;
}
