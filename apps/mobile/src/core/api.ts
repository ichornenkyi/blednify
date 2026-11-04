/** Server contract types — mirror of docs/API.md (v1). */
export type ApiTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId: string;
  artistId: string;
  durationMs: number;
  trackNumber: number | null;
  discNumber: number | null;
  year: number | null;
  genre: string | null;
  mimeType: string;
  sizeBytes: number;
  bitrate: number | null;
  hasArtwork: boolean;
  addedAt: string;
};
export type ApiAlbum = {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  year: number | null;
  trackCount: number;
  durationMs: number;
  artworkTrackId: string | null;
};
export type ApiArtist = {
  id: string;
  name: string;
  albumCount: number;
  trackCount: number;
  artworkTrackId: string | null;
};
export type ApiPage<T> = { items: T[]; total: number; limit: number; offset: number };
export type ApiHealth = { ok: boolean; name: string; version: string; trackCount: number };
export type ApiSearch = { tracks: ApiTrack[]; albums: ApiAlbum[]; artists: ApiArtist[] };

const DEFAULT_TIMEOUT_MS = 12_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function queryString(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/** GET JSON from `${base}${path}` with a hard timeout; honours an outer AbortSignal (react-query). */
export async function apiGet<T>(
  base: string,
  path: string,
  signal?: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  if (!base) throw new ApiError('No server configured');
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onAbort = () => ctrl.abort();
  if (signal?.aborted) ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(base + path, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: unknown };
        if (typeof body?.error === 'string') message = body.error;
      } catch {
        // Non-JSON error body; keep the status text.
      }
      throw new ApiError(message, res.status);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (timedOut) throw new ApiError('Server did not respond in time');
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const seg = encodeURIComponent;
export const trackStreamUrl = (base: string, id: string) => `${base}/api/tracks/${seg(id)}/stream`;
export const trackArtworkUrl = (base: string, id: string) => `${base}/api/tracks/${seg(id)}/artwork`;
