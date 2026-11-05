import type { Release } from "./torrent-match";

const AUDIO_CATEGORY = 3000;
const SEARCH_TIMEOUT_MS = 90_000;

type JackettResult = { Title?: string; MagnetUri?: string | null; Link?: string | null; Seeders?: number | null };

export class Jackett {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  /** Audio releases from every configured indexer. Errors never include the URL, which carries the API key. */
  async search(query: string, signal: AbortSignal): Promise<Release[]> {
    const params = new URLSearchParams({ apikey: this.apiKey, Query: query, "Category[]": String(AUDIO_CATEGORY) });
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/v2.0/indexers/all/results?${params}`, {
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(SEARCH_TIMEOUT_MS)]),
      });
    } catch (err) {
      if (signal.aborted) throw err;
      throw new Error("could not reach Jackett");
    }
    if (!res.ok) throw new Error(`Jackett returned HTTP ${res.status}`);
    const body = (await res.json()) as { Results?: JackettResult[] };
    return (body.Results ?? []).flatMap((r) => {
      const link = r.MagnetUri || r.Link;
      return r.Title && link && /^(magnet:|https?:)/i.test(link) ? [{ title: r.Title, link, seeders: r.Seeders ?? 0 }] : [];
    });
  }
}
