// Deteção de duplicados entre scans. O título gerado pela IA varia entre
// execuções, por isso o hash por título falhava; aqui compara-se também o URL
// normalizado (sem tracking, www, #, barra final) e títulos normalizados.

export function normalizeUrl(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const params = [...u.searchParams.entries()]
      .filter(([k]) => !/^(utm_|fbclid|gclid|mc_|ref$|source$)/i.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    const qs = params.length ? "?" + params.map(([k, v]) => `${k}=${v}`).join("&") : "";
    const path = u.pathname.replace(/\/+$/, "").replace(/\/index\.(html?|php|aspx?)$/i, "");
    return `${host}${path}${qs}`;
  } catch {
    return raw.trim().toLowerCase().replace(/#.*$/, "").replace(/\/+$/, "");
  }
}

export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(t: string): Set<string> {
  return new Set(normalizeTitle(t).split(" ").filter((w) => w.length > 2));
}

function similar(a: Set<string>, b: Set<string>): boolean {
  if (a.size < 4 || b.size < 4) return false;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter) >= 0.8;
}

export class KnownDetections {
  hashes = new Set<string>();
  urls = new Set<string>();
  titles = new Set<string>();
  private tokenList: Set<string>[] = [];

  isDuplicate(url: string | null | undefined, title: string): boolean {
    const u = normalizeUrl(url);
    if (u && this.urls.has(u)) return true;
    const nt = normalizeTitle(title);
    if (nt && this.titles.has(nt)) return true;
    const tk = tokens(title);
    return this.tokenList.some((o) => similar(tk, o));
  }

  add(url: string | null | undefined, title: string, hash?: string) {
    const u = normalizeUrl(url);
    if (u) this.urls.add(u);
    const nt = normalizeTitle(title);
    if (nt) this.titles.add(nt);
    this.tokenList.push(tokens(title));
    if (hash) this.hashes.add(hash);
  }
}

/** Carrega TODAS as deteções (qualquer estado), paginando — o limite por omissão é 1000. */
export async function loadKnownDetections(admin: any): Promise<KnownDetections> {
  const known = new KnownDetections();
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await admin
      .from("detections")
      .select("title,source_url,content_hash")
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) known.add(r.source_url, r.title ?? "", r.content_hash);
    if (!data || data.length < page) break;
  }
  return known;
}
