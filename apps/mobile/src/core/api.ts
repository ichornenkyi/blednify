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

async function errorFrom(res: Response): Promise<ApiError> {
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body?.error === 'string') message = body.error;
  } catch {
    // Non-JSON error body; keep the status text.
  }
  return new ApiError(message, res.status);
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
    if (!res.ok) throw await errorFrom(res);
    return (await res.json()) as T;
  } catch (e) {
    if (timedOut) throw new ApiError('Server did not respond in time');
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Admin request (`POST`/`DELETE`). Resolves with the parsed JSON body, or null when the response has none. */
export async function apiWrite<T>(
  base: string,
  method: 'POST' | 'DELETE',
  path: string,
  options: { token: string; body?: unknown; timeoutMs: number },
): Promise<T | null> {
  if (!base) throw new ApiError('No server configured');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options.timeoutMs);
  try {
    const res = await fetch(base + path, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw await errorFrom(res);
    return res.status === 204 ? null : ((await res.json()) as T);
  } catch (e) {
    if (ctrl.signal.aborted) throw new ApiError('Server did not respond in time');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const seg = encodeURIComponent;
export const trackStreamUrl = (base: string, id: string) => `${base}/api/tracks/${seg(id)}/stream`;
/** Bump to make every client drop the covers it has cached. */
const ARTWORK_VERSION = 2;
export const trackArtworkUrl = (base: string, id: string, size?: number) =>
  `${base}/api/tracks/${seg(id)}/artwork?v=${ARTWORK_VERSION}${size ? `&size=${size}` : ''}`;

/** The server's resize buckets. Asking for exactly these lets nearby sizes share one URL in the image cache. */
const ARTWORK_SIZES = [16, 64, 128, 256, 512, 1024];

/** Points a full-size server artwork URL at a copy at least `px` wide. Anything else, like a downloaded file, is unchanged. */
export function resizedArtworkUrl(uri: string, px: number) {
  if (!/\/artwork\?v=\d+$/.test(uri)) return uri;
  return `${uri}&size=${ARTWORK_SIZES.find((s) => s >= px) ?? 1024}`;
}

/** DELETE `${base}${path}` with the admin bearer token; resolves on any 2xx. */
export async function apiDelete(base: string, path: string, token: string): Promise<void> {
  if (!base) throw new ApiError('No server configured');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(base + path, { method: 'DELETE', headers, signal: ctrl.signal });
    if (res.ok) return;
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body?.error === 'string') message = body.error;
    } catch {
      // Non-JSON error body; keep the status text.
    }
    if (res.status === 401 || res.status === 403) message = token ? 'Admin token rejected by the server' : 'Set the admin token in Settings first';
    throw new ApiError(message, res.status);
  } catch (e) {
    if (ctrl.signal.aborted) throw new ApiError('Server did not respond in time');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
