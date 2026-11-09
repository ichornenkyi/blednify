/**
 * Web: the browser fetches Media Session artwork itself, same-origin, so the listen-token cookie
 * (see web-session.ts) authorises it. No local copies needed.
 */
const SIZE = 512;

export function lockArtwork(uri: string | null | undefined, _onReady: (local: string) => void): string | undefined {
  if (!uri) return undefined;
  return `${uri}${uri.includes('?') ? '&' : '?'}size=${SIZE}`;
}

export function prefetchLockArtwork(_uri: string | null | undefined): void {}
