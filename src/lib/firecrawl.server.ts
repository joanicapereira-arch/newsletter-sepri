// Minimal Firecrawl v2 client via fetch
const FC_BASE = "https://api.firecrawl.dev/v2";

export interface FirecrawlScrapeResult {
  markdown?: string;
  links?: string[];
  metadata?: { title?: string; sourceURL?: string };
}

function authHeaders() {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY em falta");
  return { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
}

export async function firecrawlScrape(url: string): Promise<FirecrawlScrapeResult | null> {
  const res = await fetch(`${FC_BASE}/scrape`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      url,
      formats: ["markdown", "links"],
      onlyMainContent: true,
      waitFor: 1500,
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
export async function firecrawlDeepScrape(
  rootUrl: string,
  opts: { maxPages?: number; perPageChars?: number } = {},
): Promise<{ markdown: string; pages: number }> {
  const maxPages = opts.maxPages ?? 6;
  const perPageChars = opts.perPageChars ?? 4000;

  const root = await firecrawlScrape(rootUrl);
  const parts: string[] = [];
  if (root?.markdown) {
    parts.push(`# Fonte raiz: ${rootUrl}\n\n${root.markdown.slice(0, perPageChars * 2)}`);
  }

  // Descobrir URLs candidatas a notícias/legislação via /map
  let candidates: string[] = [];
  try {
    const mapRes = await fetch(`${FC_BASE}/map`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ url: rootUrl, limit: 200, includeSubdomains: false }),
    });
    if (mapRes.ok) {
      const mj = (await mapRes.json()) as { links?: string[]; data?: { links?: string[] } };
      candidates = mj.links ?? mj.data?.links ?? [];
    }
  } catch {
    // ignora
  }

  // Heurística: privilegia URLs com sinais típicos de notícias/datas recentes
  const yearPattern = /\/(2025|2026)\//;
  const newsPattern = /(noticia|news|comunicado|press|legisla|circular|diploma|despacho|portaria|aviso|orientac|alerta|publicac)/i;
  const filtered = Array.from(new Set(candidates))
    .filter((u) => u !== rootUrl)
    .filter((u) => yearPattern.test(u) || newsPattern.test(u))
    .slice(0, maxPages);

  // Fallback: usa os primeiros links retornados pelo scrape root se o map não trouxe nada
  const finalList = filtered.length > 0 ? filtered : (root?.links ?? []).filter((u) => newsPattern.test(u)).slice(0, maxPages);

  let pages = root?.markdown ? 1 : 0;
  for (const u of finalList) {
    try {
      const sub = await firecrawlScrape(u);
      if (sub?.markdown) {
        parts.push(`\n\n---\n# ${u}\n\n${sub.markdown.slice(0, perPageChars)}`);
        pages++;
      }
    } catch {
      // ignora subpágina com erro
    }
  }

  return { markdown: parts.join("\n"), pages };
}

