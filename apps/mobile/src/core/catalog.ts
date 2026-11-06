import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import {
  ApiError,
  apiDelete,
  apiGet,
  queryString,
  type ApiAlbum,
  type ApiArtist,
  type ApiHealth,
  type ApiPage,
  type ApiSearch,
  type ApiTrack,
} from './api';
import { removeDownload } from './downloads';
import { deleteLocalTrack } from './import/importer';
import { fetchLocalAlbumTracks, fetchLocalArtistTracks, purgeTrackReferences, searchLocal } from './library';
import { removeKeysFromQueue } from './player/engine';
import { libKeys, queryClient } from './query-client';
import { getServerBase, normalizeServerUrl, settingsStore, useServerBase } from './settings';
import {
  albumsFromTracks,
  artistsFromTracks,
  dedupeByKey,
  EMPTY_TRACKS,
  fromApiAlbum,
  fromApiArtist,
  fromApiTrack,
  resolveTrack,
  useResolveCtx,
  useResolvedTracks,
} from './tracks';
import type { AlbumView, AppTrack, ArtistView, Origin } from './types';
import { errorMessage } from './util';

const PAGE_SIZE = 100;
const CATALOG_STALE_MS = 5 * 60_000;

// ---------------------------------------------------------------------------------------------
// Server status

export function useServerStatus(): { online: boolean; trackCount: number; isLoading: boolean; serverUrl: string } {
  const base = useServerBase();
  const q = useQuery({
    queryKey: ['health', base],
    queryFn: ({ signal }) => apiGet<ApiHealth>(base, '/api/health', signal, 5_000),
    enabled: !!base,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 0,
  });
  return {
    online: !!base && q.status === 'success' && q.data.ok === true,
    trackCount: q.data?.trackCount ?? 0,
    isLoading: !!base && q.isLoading,
    serverUrl: base,
  };
}

export async function testServer(url: string): Promise<{ ok: boolean; trackCount?: number; error?: string }> {
  const base = normalizeServerUrl(url);
  if (!base) return { ok: false, error: 'Enter a server URL' };
  try {
    const h = await apiGet<ApiHealth>(base, '/api/health', undefined, 6_000);
    if (!h?.ok || h.name !== 'blednify') return { ok: false, error: 'Not a Blednify server' };
    return { ok: true, trackCount: h.trackCount };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export type DeleteResult = { deleted: number; failed: number; error?: string };

/**
 * Delete tracks' files from the server (admin token required), then clean up everything pointing at them.
 * Stops at the first auth failure; a 404 counts as already deleted.
 */
async function deleteServerTracks(keys: readonly string[]): Promise<DeleteResult> {
  const base = getServerBase();
  const { adminToken } = settingsStore.getState();
  const done: string[] = [];
  let error: string | undefined;
  for (const key of keys) {
    try {
      await apiDelete(base, `/api/tracks/${encodeURIComponent(key.slice(2))}`, adminToken);
      done.push(key);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        done.push(key);
        continue;
      }
      error ??= errorMessage(e);
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) break;
    }
  }
  if (done.length) {
    removeKeysFromQueue(new Set(done));
    for (const key of done) await removeDownload(key);
    await purgeTrackReferences(done);
    // The server catalog (tracks, albums, artists, search, health) all changed.
    void queryClient.invalidateQueries();
  }
  return { deleted: done.length, failed: keys.length - done.length, error };
}

export async function deleteServerTrack(key: string): Promise<void> {
  if (!key.startsWith('r:')) return;
  const r = await deleteServerTracks([key]);
  if (r.failed) throw new Error(r.error ?? 'Could not delete the track');
}

/** Bulk delete by track key: `r:` keys from the server, `l:` keys from this device. */
export async function deleteTracks(keys: readonly string[]): Promise<DeleteResult> {
  const remote = keys.filter((k) => k.startsWith('r:'));
  const local = keys.filter((k) => k.startsWith('l:'));
  const res = remote.length ? await deleteServerTracks(remote) : { deleted: 0, failed: 0 };
  let { deleted, failed } = res;
  let error = (res as DeleteResult).error;
  for (const key of local) {
    try {
      await deleteLocalTrack(key);
      deleted++;
    } catch (e) {
      failed++;
      error ??= errorMessage(e);
    }
  }
  return { deleted, failed, error };
}

/** Track keys of whole albums, resolved at call time (remote via the server, local from the device). */
export async function albumTrackKeys(albums: readonly Pick<AlbumView, 'id' | 'origin'>[]): Promise<string[]> {
  const base = getServerBase();
  const keys = new Set<string>();
  for (const a of albums) {
    if (a.origin === 'local') {
      for (const t of await fetchLocalAlbumTracks('local', a.id)) keys.add(t.key);
    } else {
      const full = await apiGet<{ tracks: ApiTrack[] }>(base, `/api/albums/${encodeURIComponent(a.id)}`);
      for (const t of full.tracks) keys.add(`r:${t.id}`);
    }
  }
  return [...keys];
}

// ---------------------------------------------------------------------------------------------
// Tracks / albums

export function useRemoteTracks(params?: { q?: string; sort?: 'added' | 'title' | 'artist' }): {
  tracks: AppTrack[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch(): void;
  fetchNextPage(): void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
} {
  const base = useServerBase();
  const q = params?.q?.trim() ?? '';
  const sort = params?.sort ?? 'added';
  const query = useInfiniteQuery({
    queryKey: ['tracks', base, q, sort],
    queryFn: ({ pageParam, signal }) =>
      apiGet<ApiPage<ApiTrack>>(
        base,
        `/api/tracks${queryString({ q, sort, limit: PAGE_SIZE, offset: pageParam })}`,
        signal,
      ),
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const next = last.offset + last.items.length;
      return last.items.length > 0 && next < last.total ? next : undefined;
    },
    enabled: !!base,
    staleTime: CATALOG_STALE_MS,
  });
  const ctx = useResolveCtx();
  const tracks = useMemo(
    () =>
      query.data
        ? query.data.pages.flatMap((p) => p.items.map((t) => resolveTrack(fromApiTrack(t, base), ctx)))
        : EMPTY_TRACKS,
    [query.data, base, ctx],
  );
  const { hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = query;
  return {
    tracks,
    total: query.data?.pages[0]?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: () => void refetch(),
    fetchNextPage: () => {
      if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
    },
    hasNextPage,
    isFetchingNextPage,
  };
}

async function fetchAllAlbums(base: string, signal: AbortSignal): Promise<ApiAlbum[]> {
  const out: ApiAlbum[] = [];
  for (;;) {
    const page = await apiGet<ApiPage<ApiAlbum>>(
      base,
      `/api/albums${queryString({ limit: 500, offset: out.length })}`,
      signal,
    );
    out.push(...page.items);
    if (!page.items.length || out.length >= page.total) return out;
  }
}

const EMPTY_ALBUMS: AlbumView[] = [];
const EMPTY_ARTISTS: ArtistView[] = [];

export function useRemoteAlbums(): { albums: AlbumView[]; isLoading: boolean; refetch(): void } {
  const base = useServerBase();
  const q = useQuery({
    queryKey: ['albums', base],
    queryFn: ({ signal }) => fetchAllAlbums(base, signal),
    enabled: !!base,
    staleTime: CATALOG_STALE_MS,
  });
  const albums = useMemo(() => (q.data ? q.data.map((a) => fromApiAlbum(a, base)) : EMPTY_ALBUMS), [q.data, base]);
  const { refetch } = q;
  return { albums, isLoading: q.isLoading, refetch: () => void refetch() };
}

export function useAlbum(id: string, origin: Origin): { album: AlbumView | null; tracks: AppTrack[]; isLoading: boolean } {
  const base = useServerBase();
  const remote = useQuery({
    queryKey: ['album', base, id],
    queryFn: ({ signal }) =>
      apiGet<ApiAlbum & { tracks: ApiTrack[] }>(base, `/api/albums/${encodeURIComponent(id)}`, signal),
    enabled: origin === 'remote' && !!base && !!id,
    staleTime: CATALOG_STALE_MS,
  });
  // Local albums come from SQLite; for remote albums this is the downloaded subset (offline fallback).
  const local = useQuery({
    queryKey: libKeys.album(origin, id),
    queryFn: () => fetchLocalAlbumTracks(origin, id),
    enabled: !!id,
    staleTime: Infinity,
  });
  const remoteTracks = useMemo(
    () => remote.data?.tracks.map((t) => fromApiTrack(t, base)),
    [remote.data, base],
  );
  const tracks = useResolvedTracks(remoteTracks ?? local.data);
  const album = useMemo(() => {
    if (remote.data) return fromApiAlbum(remote.data, base);
    return albumsFromTracks(tracks)[0] ?? null;
  }, [remote.data, base, tracks]);
  const isLoading =
    origin === 'remote' ? remote.isLoading && !local.data?.length : local.isLoading;
  return { album, tracks, isLoading };
}

export function useArtist(
  id: string,
  origin: Origin,
): { artist: ArtistView | null; albums: AlbumView[]; tracks: AppTrack[]; isLoading: boolean } {
  const base = useServerBase();
  const remote = useQuery({
    queryKey: ['artist', base, id],
    queryFn: ({ signal }) =>
      apiGet<ApiArtist & { albums: ApiAlbum[]; tracks: ApiTrack[] }>(
        base,
        `/api/artists/${encodeURIComponent(id)}`,
        signal,
      ),
    enabled: origin === 'remote' && !!base && !!id,
    staleTime: CATALOG_STALE_MS,
  });
  const local = useQuery({
    queryKey: libKeys.artist(origin, id),
    queryFn: () => fetchLocalArtistTracks(origin, id),
    enabled: !!id,
    staleTime: Infinity,
  });
  const remoteTracks = useMemo(
    () => remote.data?.tracks.map((t) => fromApiTrack(t, base)),
    [remote.data, base],
  );
  const tracks = useResolvedTracks(remoteTracks ?? local.data);
  const { artist, albums } = useMemo(() => {
    if (remote.data)
      return {
        artist: fromApiArtist(remote.data, base),
        albums: remote.data.albums.map((a) => fromApiAlbum(a, base)),
      };
    return { artist: artistsFromTracks(tracks)[0] ?? null, albums: albumsFromTracks(tracks) };
  }, [remote.data, base, tracks]);
  const isLoading =
    origin === 'remote' ? remote.isLoading && !local.data?.length : local.isLoading;
  return { artist, albums, tracks, isLoading };
}

// ---------------------------------------------------------------------------------------------
// Search

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const dedupeById = <T extends { id: string; origin: Origin }>(items: readonly T[]): T[] =>
  dedupeByKey(items.map((it) => ({ key: `${it.origin}:${it.id}`, it }))).map((x) => x.it);

export function useSearch(q: string): {
  tracks: AppTrack[];
  albums: AlbumView[];
  artists: ArtistView[];
  isLoading: boolean;
} {
  const base = useServerBase();
  const term = useDebounced(q.trim(), 200);
  const pending = term !== q.trim();
  const local = useQuery({
    queryKey: libKeys.search(term),
    queryFn: () => searchLocal(term),
    enabled: !!term,
    staleTime: 30_000,
  });
  const remote = useQuery({
    queryKey: ['search', base, term],
    queryFn: ({ signal }) => apiGet<ApiSearch>(base, `/api/search${queryString({ q: term, limit: 20 })}`, signal),
    enabled: !!base && !!term,
    staleTime: CATALOG_STALE_MS,
    placeholderData: (prev) => prev,
  });
  const ctx = useResolveCtx();
  return useMemo(() => {
    if (!term) return { tracks: EMPTY_TRACKS, albums: EMPTY_ALBUMS, artists: EMPTY_ARTISTS, isLoading: pending };
    const needle = term.toLowerCase();
    const localTracks = (local.data ?? EMPTY_TRACKS).map((t) => resolveTrack(t, ctx));
    const r = remote.data;
    const remoteTracks = r ? r.tracks.map((t) => resolveTrack(fromApiTrack(t, base), ctx)) : EMPTY_TRACKS;
    const localAlbums = albumsFromTracks(
      localTracks.filter((t) => t.album.toLowerCase().includes(needle) || t.artist.toLowerCase().includes(needle)),
    );
    const localArtists = artistsFromTracks(localTracks.filter((t) => t.artist.toLowerCase().includes(needle)));
    return {
      tracks: dedupeByKey([...localTracks, ...remoteTracks]),
      albums: dedupeById([...localAlbums, ...(r ? r.albums.map((a) => fromApiAlbum(a, base)) : EMPTY_ALBUMS)]),
      artists: dedupeById([...localArtists, ...(r ? r.artists.map((a) => fromApiArtist(a, base)) : EMPTY_ARTISTS)]),
      isLoading: pending || local.isLoading || (!!base && remote.isLoading),
    };
  }, [term, pending, local.data, local.isLoading, remote.data, remote.isLoading, base, ctx]);
}
