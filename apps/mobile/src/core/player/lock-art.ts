/**
 * Artwork for the lock screen / media notification.
 *
 * Android fetches the notification artwork itself, without our headers, so covers on a server that needs
 * a token (LISTEN_TOKEN) would 401. We download those covers with the token into the cache directory and
 * hand the OS a file:// URI instead. Covers that need no token are passed through unchanged.
 */
import { Directory, File, Paths } from 'expo-file-system';

import { authHeadersFor } from '../auth';

const SIZE = 512;
const MAX_FILES = 60;

/** Remote URL -> local file URI, in insertion order (oldest first) for pruning. */
const ready = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
let dir: Directory | null = null;

function cacheDir(): Directory {
  if (!dir) {
    dir = new Directory(Paths.cache, 'lock-art');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

/** Stable file name for a URL (FNV-1a; collisions only cost a wrong cover until the next fetch). */
function nameFor(url: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) h = Math.imul(h ^ url.charCodeAt(i), 0x01000193);
  return `${(h >>> 0).toString(36)}_${url.length}.img`;
}

function prune() {
  while (ready.size > MAX_FILES) {
    const [url, uri] = ready.entries().next().value as [string, string];
    ready.delete(url);
    try {
      new File(uri).delete();
    } catch {
      // Already gone.
    }
  }
}

/**
 * URI the OS can load for `uri` right now, or undefined. When the cover needs a token and is not cached
 * yet, starts the download and calls `onReady` with the local URI once it lands.
 */
export function lockArtwork(uri: string | null | undefined, onReady: (local: string) => void): string | undefined {
  if (!uri) return undefined;
  const headers = authHeadersFor(uri);
  if (!headers) return uri;
  const cached = ready.get(uri);
  if (cached) return cached;
  void fetchArt(uri, headers).then((local) => {
    if (local) onReady(local);
  });
  return undefined;
}

/** Warm the cache for an upcoming track so its cover is ready when native auto-advances. */
export function prefetchLockArtwork(uri: string | null | undefined): void {
  if (!uri || ready.has(uri)) return;
  const headers = authHeadersFor(uri);
  if (headers) void fetchArt(uri, headers);
}

function fetchArt(uri: string, headers: Record<string, string>): Promise<string | null> {
  let p = inflight.get(uri);
  if (p) return p;
  p = (async () => {
    try {
      const file = new File(cacheDir(), nameFor(uri));
      if (!file.exists) {
        const sep = uri.includes('?') ? '&' : '?';
        await File.downloadFileAsync(`${uri}${sep}size=${SIZE}`, file, { headers, idempotent: true });
      }
      ready.set(uri, file.uri);
      prune();
      return file.uri;
    } catch (e) {
      try {
        const partial = new File(cacheDir(), nameFor(uri));
        if (partial.exists) partial.delete();
      } catch {
        // Nothing to clean up.
      }
      console.warn('[player] lock-screen artwork', e);
      return null;
    } finally {
      inflight.delete(uri);
    }
  })();
  inflight.set(uri, p);
  return p;
}
