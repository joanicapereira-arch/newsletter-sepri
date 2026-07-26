// Minimal Firecrawl v2 client via fetch
const FC_BASE = "https://api.firecrawl.dev/v2";

export interface FirecrawlScrapeResult {
  markdown?: string;
  links?: string[];
  metadata?: { title?: string; sourceURL?: string; statusCode?: number };
}

function authHeaders() {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY em falta");
  return { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
}

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function firecrawlScrape(
  url: string,
  waitFor = 250,
  timeoutMs = 8000,
): Promise<FirecrawlScrapeResult | null> {
  const res = await fetch(`${FC_BASE}/scrape`, {
    method: "POST",
    headers: authHeaders(),
    signal: timeoutSignal(timeoutMs + 1500),
    body: JSON.stringify({
      url,
      formats: ["markdown", "links"],
      onlyMainContent: true,
      waitFor,
      timeout: timeoutMs,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firecrawl ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { success: boolean; data?: FirecrawlScrapeResult } & FirecrawlScrapeResult;
  return (json.data ?? json) as FirecrawlScrapeResult;
}


/**
 * Faz scraping mais profundo: além da página principal, descobre URLs
 * relacionadas via /map e faz scrape das top N páginas candidatas a notícias.
 * Concatena o markdown de todas (limitado), permitindo à IA cobrir mais
 * itens publicados nos últimos meses (e não só os 5–10 da homepage).
 */
export interface LinkRef {
  text: string;
  url: string;
}

function extractMarkdownLinks(md: string, rootUrl: string): LinkRef[] {
  const out: LinkRef[] = [];
  const seen = new Set<string>();
  const re = /\[([^\]]{3,200})\]\((https?:\/\/[^)\s]+)\)/g;
  const rootNorm = rootUrl.replace(/\/$/, "");
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const text = m[1].replace(/\s+/g, " ").trim();
    const url = m[2].trim();
    if (!text || !url) continue;
    if (url.replace(/\/$/, "") === rootNorm) continue;
    if (/\.(png|jpg|jpeg|svg|gif|webp|ico|css|js)(\?|#|$)/i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ text, url });
  }
  return out;
}

export async function firecrawlDeepScrape(
  rootUrl: string,
  opts: { maxPages?: number; perPageChars?: number } = {},
): Promise<{ markdown: string; pages: number; links: LinkRef[] }> {
  const maxPages = opts.maxPages ?? 0;
  const perPageChars = opts.perPageChars ?? 3500;

  const [root, mapJson] = await Promise.all([
    firecrawlScrape(rootUrl, 250, 8000).catch(() => null),
    fetch(`${FC_BASE}/map`, {
      method: "POST",
      headers: authHeaders(),
      signal: timeoutSignal(7000),
      body: JSON.stringify({ url: rootUrl, limit: 60, includeSubdomains: false }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ links?: string[]; data?: { links?: string[] } }>) : null))
      .catch(() => null),
  ]);

  const parts: string[] = [];
  const linkPool: LinkRef[] = [];
  if (root?.markdown) {
    parts.push(`# Fonte raiz: ${rootUrl}\n\n${root.markdown.slice(0, perPageChars * 2)}`);
    linkPool.push(...extractMarkdownLinks(root.markdown, rootUrl));
  }

  const candidates = mapJson?.links ?? mapJson?.data?.links ?? [];
  const year = new Date().getFullYear();
  const yearPattern = new RegExp(`(${year}|${year - 1})`);
  const newsPattern = /(noticia|news|comunicado|press|legisla|circular|diploma|despacho|portaria|aviso|orientac|alerta|publicac)/i;
  const scored = Array.from(new Set(candidates))
    .filter((u) => u !== rootUrl)
    .map((u) => {
      const decoded = decodeURIComponent(u).toLowerCase();
      const score = (yearPattern.test(decoded) ? 3 : 0) + (newsPattern.test(decoded) ? 5 : 0);
      return { u, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.u);

  if (scored.length) {
    parts.push(`\n\n---\n# URLs candidatas recentes/temáticas\n\n${scored.slice(0, 40).join("\n")}`);
  }

  const filtered = scored.slice(0, maxPages);
  const finalList = filtered.length > 0
    ? filtered
    : (root?.links ?? []).filter((u) => newsPattern.test(u)).slice(0, maxPages);

  const subs = await Promise.all(
    finalList.map((u) =>
      firecrawlScrape(u, 150, 6000)
        .then((sub) => ({ u, sub }))
        .catch(() => ({ u, sub: null as FirecrawlScrapeResult | null })),
    ),
  );

  let pages = root?.markdown ? 1 : 0;
  for (const { u, sub } of subs) {
    if (sub?.markdown) {
      parts.push(`\n\n---\n# ${u}\n\n${sub.markdown.slice(0, perPageChars)}`);
      linkPool.push(...extractMarkdownLinks(sub.markdown, rootUrl));
      pages++;
    }
  }

  const seen = new Set<string>();
  const links = linkPool.filter((l) => (seen.has(l.url) ? false : (seen.add(l.url), true)));

  return { markdown: parts.join("\n"), pages, links };
}

const STOP = new Set([
  "de","da","do","das","dos","e","a","o","as","os","em","no","na","nos","nas","para","por","com","um","uma","the","of","and","to","in","on","at","for","nº","º","ª",
]);

function tokens(s: string): Set<string> {
  const norm = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const parts = norm.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
  return new Set(parts);
}

/**
 * Devolve os melhores candidatos a URL específica para um título, ordenados
 * por relevância (overlap de tokens entre o título e o texto da hiperligação).
 * Ao contrário da versão anterior (que devolvia só o "vencedor"), aqui
 * devolvemos uma lista para que o chamador possa validar cada candidato
 * (ex: confirmar que a página existe e fala mesmo do assunto) e avançar
 * para o próximo se o primeiro falhar a validação.
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
 * 1. Responde com sucesso (segue redirects; aceita 200-299).
 * 2. O conteúdo da página tem alguma sobreposição de vocabulário com o
 *    título detetado — evita aceitar páginas de listagem/genéricas ou URLs
 *    alucinadas pela IA que por acaso não coincidem com a raiz da fonte
 *    mas também não são a notícia em causa.
 * Devolve a URL final (após redirects) se válida, ou null caso contrário.
 */
export async function verifyArticleUrl(
  url: string,
  title: string,
  timeoutMs = 7000,
): Promise<string | null> {
  let finalUrl = url;
  let text = "";
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: timeoutSignal(timeoutMs),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEPRI-Monitor/1.0)" },
    });
    if (!res.ok) return null;
    finalUrl = res.url || url;
    text = await res.text();
  } catch {
    return null;
  }

  if (text.replace(/<[^>]+>/g, " ").trim().length < 300) {
    try {
      const scraped = await firecrawlScrape(finalUrl, 300, Math.min(timeoutMs, 6000));
      if (scraped?.markdown) text = scraped.markdown;
    } catch {
      /* mantém o texto (curto) já obtido */
    }
  }

  const pageTokens = tokens(text.slice(0, 6000));
  const titleTokens = tokens(title);
  if (titleTokens.size === 0) return finalUrl;
  let overlap = 0;
  for (const t of titleTokens) if (pageTokens.has(t)) overlap++;
  const ratio = overlap / titleTokens.size;
  if (ratio >= 0.25 || overlap >= 2) return finalUrl;
  return null;
}
