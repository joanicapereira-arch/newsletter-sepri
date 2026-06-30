// Minimal Firecrawl v2 client via fetch
const FC_BASE = "https://api.firecrawl.dev/v2";

export interface FirecrawlScrapeResult {
  markdown?: string;
  links?: string[];
  metadata?: { title?: string; sourceURL?: string };
}

export async function firecrawlScrape(url: string): Promise<FirecrawlScrapeResult | null> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY em falta");
  const res = await fetch(`${FC_BASE}/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
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
