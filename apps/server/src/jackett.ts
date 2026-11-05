import type { Release } from "./torrent-match";

/** Audio, and Other: indexers such as RuTor do not report categories, so Jackett files all their results under Other. */
const CATEGORIES = ["3000", "8000"];
const SEARCH_TIMEOUT_MS = 90_000;

type JackettResult = { Title?: string; MagnetUri?: string | null; Link?: string | null; Seeders?: number | null };

export class Jackett {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  /** The indexers set up in Jackett. */
  async indexers(signal: AbortSignal): Promise<{ id: string; name: string }[]> {
    const params = new URLSearchParams({ apikey: this.apiKey, t: "indexers", configured: "true" });
    const xml = await (await this.get(`${this.baseUrl}/api/v2.0/indexers/all/results/torznab/api?${params}`, signal)).text();
    return [...xml.matchAll(/<indexer id="([^"]+)" configured="true">\s*<title>([^<]+)<\/title>/g)].map(([, id, name]) => ({
      id: id!,
      name: name!.replaceAll("&amp;", "&").trim(),
    }));
  }

  /** Releases from the given indexers, or from all of them if none are given. Errors never include the URL, which carries the API key. */
  async search(query: string, signal: AbortSignal, indexers: string[] = []): Promise<Release[]> {
    const params = new URLSearchParams({ apikey: this.apiKey, Query: query });
    for (const category of CATEGORIES) params.append("Category[]", category);
    for (const indexer of indexers) params.append("Tracker[]", indexer);
    const res = await this.get(`${this.baseUrl}/api/v2.0/indexers/all/results?${params}`, signal);
    const body = (await res.json()) as { Results?: JackettResult[] };
    return (body.Results ?? []).flatMap((r) => {
      const link = r.MagnetUri || r.Link;
      return r.Title && link && /^(magnet:|https?:)/i.test(link) ? [{ title: r.Title, link, seeders: r.Seeders ?? 0 }] : [];
    });
  }

  private async get(url: string, signal: AbortSignal): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(url, { redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(SEARCH_TIMEOUT_MS)]) });
    } catch (err) {
      if (signal.aborted) throw err;
      throw new Error("could not reach Jackett");
    }
    if (!res.ok) throw new Error(`Jackett returned HTTP ${res.status}`);
    return res;
  }
}
