// Scraper direto (fetch nativo + regex simples), sem depender de nenhum serviço
// externo (Firecrawl) nem de nenhum pacote de parsing HTML (cheerio) — usa a
// mesma técnica de limpeza por regex que já existia como fallback noutro
// ponto do código (manual-detection.server.ts) antes desta alteração.
// Mantém a mesma interface pública que o antigo firecrawl.server.ts.

const UA = "Mozilla/5.0 (compatible; SEPRI-Monitor/1.0; +https://sepri.pt)";

export interface ScrapeResult {
  markdown?: string; // texto limpo da página (nome mantido por compatibilidade)
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

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractTitle(html: string): string {
  return decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim());
}

function extractLinks(html: string, baseUrl: string): LinkRef[] {
  const links: LinkRef[] = [];
  const seen = new Set<string>();
  const re = /<a\s+[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const rawHref = m[1].trim();
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (!rawHref || !text || text.length < 3) continue;
    try {
      const abs = new URL(rawHref, baseUrl).toString();
      if (!/^https?:\/\//i.test(abs)) continue;
      if (seen.has(abs)) continue;
      seen.add(abs);
      links.push({ text, url: abs });
    } catch {
      /* URL inválido, ignora */
    }
  }
  return links;
}

/** Extrai texto legível de uma página, removendo scripts/estilos/menus e tags HTML. */
function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(nav|header|footer|form|svg|iframe|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map((l) => decodeEntities(l).replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Faz scrape de uma única página. */
export async function scrapePage(url: string, _waitFor = 250, timeoutMs = 9000): Promise<ScrapeResult | null> {
  const fetched = await fetchHtml(url, timeoutMs);
  if (!fetched) return null;
  const text = extractText(fetched.html);
  if (!text) return null;
  return {
    markdown: text,
    metadata: { title: extractTitle(fetched.html), sourceURL: fetched.finalUrl, statusCode: 200 },
  };
}

/** Nome mantido por compatibilidade com o código existente. */
export const firecrawlScrape = scrapePage;

/**
 * Faz scraping mais profundo: página principal + páginas candidatas a notícias
 * descobertas a partir dos próprios links da página raiz.
 */
export async function firecrawlDeepScrape(
  rootUrl: string,
  opts: { maxPages?: number; perPageChars?: number } = {},
): Promise<{ markdown: string; pages: number; links: LinkRef[] }> {
  const maxPages = opts.maxPages ?? 0;
  const perPageChars = opts.perPageChars ?? 3500;

  const rootFetch = await fetchHtml(rootUrl, 9000);
  if (!rootFetch) return { markdown: "", pages: 0, links: [] };

  const rootText = extractText(rootFetch.html);
  const rootLinks = extractLinks(rootFetch.html, rootFetch.finalUrl);

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
      return { u, text: extractText(fetched.html), links: extractLinks(fetched.html, fetched.finalUrl) };
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
 */
export async function verifyArticleUrl(url: string, title: string, timeoutMs = 7000): Promise<string | null> {
  const fetched = await fetchHtml(url, timeoutMs);
  if (!fetched) return null;
  const text = extractText(fetched.html);

  const pageTokens = tokens(text.slice(0, 6000));
  const titleTokens = tokens(title);
  if (titleTokens.size === 0) return fetched.finalUrl;
  let overlap = 0;
  for (const t of titleTokens) if (pageTokens.has(t)) overlap++;
  const ratio = overlap / titleTokens.size;
  if (ratio >= 0.25 || overlap >= 2) return fetched.finalUrl;
  return null;
}
