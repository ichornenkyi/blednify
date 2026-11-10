import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { apiGet, type ApiTrack } from './api';
import { settingsStore, normalizeServerUrl, useServerBase } from './settings';
import { fromApiTrack, useResolvedTracks } from './tracks';
import type { AppTrack } from './types';

/**
 * Share links point at the server's own web app, so anyone who uses the same server can open them in a
 * browser, the iPhone web app or (via `blednify://`) the Android app. They never carry the access token.
 *
 *   /track/<id>   /album/<id>   /artist/<id>   /shared-playlist?n=<name>&t=<id>.<id>...
 */
export type ShareTarget =
  | { kind: 'track'; id: string }
  | { kind: 'album'; id: string }
  | { kind: 'artist'; id: string }
  | { kind: 'playlist'; name: string; trackIds: readonly string[] };

/** Track ids are short hex, so `.` is a safe separator that URL encoding leaves alone (keeps QR codes small). */
const ID_SEP = '.';

export function sharePath(target: ShareTarget): string {
  switch (target.kind) {
    case 'track':
    case 'album':
    case 'artist':
      return `/${target.kind}/${encodeURIComponent(target.id)}`;
    case 'playlist':
      return `/shared-playlist?n=${encodeURIComponent(target.name)}&t=${target.trackIds.map(encodeURIComponent).join(ID_SEP)}`;
  }
}

/** Full https link on the configured server, or null when no server is set (offline-only mode). */
export function shareUrl(target: ShareTarget): string | null {
  const base = normalizeServerUrl(settingsStore.getState().serverUrl);
  return base ? base + sharePath(target) : null;
}

export function parseSharedIds(raw: string | string[] | undefined): string[] {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return s ? s.split(ID_SEP).filter((id) => /^[0-9a-z]{1,64}$/i.test(id)) : [];
}

/** Server tracks only: device-imported files cannot be opened by anyone else. */
export const shareableIds = (tracks: readonly AppTrack[]): string[] =>
  tracks.filter((t) => t.origin === 'remote').map((t) => t.id);

const SHARED_STALE_MS = 5 * 60_000;

/** One server track by id, resolved against downloads like every other list. */
export function useServerTrack(id: string): { track: AppTrack | null; isLoading: boolean; isError: boolean } {
  const base = useServerBase();
  const q = useQuery({
    queryKey: ['track', base, id],
    queryFn: ({ signal }) => apiGet<ApiTrack>(base, `/api/tracks/${encodeURIComponent(id)}`, signal),
    enabled: !!base && !!id,
    staleTime: SHARED_STALE_MS,
    retry: 1,
  });
  const raw = useMemo(() => (q.data ? [fromApiTrack(q.data, base)] : undefined), [q.data, base]);
  const [track] = useResolvedTracks(raw);
  return { track: track ?? null, isLoading: q.isLoading, isError: q.isError };
}

/** Several server tracks by id, in the given order; ids the server no longer has are dropped. */
export function useServerTracks(ids: readonly string[]): { tracks: AppTrack[]; missing: number; isLoading: boolean } {
  const base = useServerBase();
  // `combine` keeps the result referentially stable until a query actually changes.
  const { data, isLoading } = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['track', base, id],
      queryFn: ({ signal }: { signal: AbortSignal }) => apiGet<ApiTrack>(base, `/api/tracks/${encodeURIComponent(id)}`, signal),
      enabled: !!base,
      staleTime: SHARED_STALE_MS,
      retry: 1,
    })),
    combine: (results) => ({
      isLoading: results.some((r) => r.isLoading),
      data: results.flatMap((r) => (r.data ? [r.data] : [])),
    }),
  });
  const raw = useMemo(() => (isLoading ? undefined : data.map((d) => fromApiTrack(d, base))), [isLoading, data, base]);
  const tracks = useResolvedTracks(raw);
  return { tracks, missing: isLoading ? 0 : ids.length - tracks.length, isLoading };
}
