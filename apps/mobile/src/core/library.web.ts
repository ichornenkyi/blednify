import { useMemo } from 'react';
import { create, useStore } from 'zustand';

import { libIndex, setLiked } from './lib-index';
import { EMPTY_TRACKS, resolveTrack, useResolveCtx, useResolvedTracks, type ResolveCtx } from './tracks';
import type { AlbumView, AppTrack, Origin, Playlist } from './types';
import { randomId } from './util';
import { readLibrary, writeLibrary, type WebLibrary, type WebPlaylist } from './web-library';

const RECENTS_CAP = 200;
const EMPTY_ALBUMS: AlbumView[] = [];

const store = create<WebLibrary>(readLibrary);

/** Persist first: if storage is full the throw leaves the in-memory state untouched. */
function commit(patch: Partial<WebLibrary>) {
  const next = { ...store.getState(), ...patch };
  writeLibrary(next);
  store.setState(next);
}

// No imported files or downloads on web.
export const useLocalTracks = (): AppTrack[] => EMPTY_TRACKS;
export const useLocalAlbums = (): AlbumView[] => EMPTY_ALBUMS;
export async function fetchLocalAlbumTracks(_origin: Origin, _albumId: string): Promise<AppTrack[]> {
  return [];
}
export async function fetchLocalArtistTracks(_origin: Origin, _artistId: string): Promise<AppTrack[]> {
  return [];
}
export async function searchLocal(_q: string, _limit?: number): Promise<AppTrack[]> {
  return [];
}

// --- Likes -----------------------------------------------------------------------------------

export function useLikedTracks(): AppTrack[] {
  const likes = useStore(store, (s) => s.likes);
  return useResolvedTracks(useMemo(() => likes.map((l) => l.track), [likes]));
}

export function useIsLiked(key: string): boolean {
  return useStore(libIndex, (s) => s.liked.has(key));
}

export async function toggleLike(track: AppTrack): Promise<void> {
  const { likes } = store.getState();
  const wasLiked = likes.some((l) => l.track.key === track.key);
  commit({
    likes: wasLiked ? likes.filter((l) => l.track.key !== track.key) : [{ track, at: Date.now() }, ...likes],
  });
  setLiked(track.key, !wasLiked);
}

// --- Recently played -------------------------------------------------------------------------

export function useRecentlyPlayed(limit = 20): AppTrack[] {
  const recents = useStore(store, (s) => s.recents);
  return useResolvedTracks(useMemo(() => recents.slice(0, limit).map((r) => r.track), [recents, limit]));
}

export async function recordRecent(track: AppTrack): Promise<void> {
  const rest = store.getState().recents.filter((r) => r.track.key !== track.key);
  commit({ recents: [{ track, at: Date.now() }, ...rest].slice(0, RECENTS_CAP) });
}

// --- Playlists -------------------------------------------------------------------------------

function toPlaylist(p: WebPlaylist, ctx?: ResolveCtx): Playlist {
  const artworkUris: string[] = [];
  for (const t of p.tracks) {
    const uri = resolveTrack(t, ctx).artworkUri;
    if (uri && !artworkUris.includes(uri)) artworkUris.push(uri);
    if (artworkUris.length === 4) break;
  }
  return {
    id: p.id,
    name: p.name,
    trackCount: p.tracks.length,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    artworkUris,
  };
}

export function usePlaylists(): Playlist[] {
  const playlists = useStore(store, (s) => s.playlists);
  const ctx = useResolveCtx();
  return useMemo(
    () =>
      playlists
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((p) => toPlaylist(p, ctx)),
    [playlists, ctx],
  );
}

export function usePlaylist(id: string): { playlist: Playlist | null; tracks: AppTrack[] } {
  const found = useStore(store, (s) => s.playlists.find((p) => p.id === id));
  const ctx = useResolveCtx();
  const tracks = useResolvedTracks(found?.tracks);
  const playlist = useMemo(() => (found ? toPlaylist(found, ctx) : null), [found, ctx]);
  return { playlist, tracks };
}

/** Applies `edit` to one playlist and bumps `updatedAt`. Unknown ids are a no-op. */
function editPlaylist(id: string, edit: (p: WebPlaylist) => Partial<WebPlaylist>) {
  const now = new Date().toISOString();
  commit({
    playlists: store.getState().playlists.map((p) => (p.id === id ? { ...p, ...edit(p), updatedAt: now } : p)),
  });
}

export async function createPlaylist(name: string): Promise<string> {
  const id = randomId();
  const now = new Date().toISOString();
  const playlist: WebPlaylist = { id, name: name.trim() || 'New playlist', createdAt: now, updatedAt: now, tracks: [] };
  commit({ playlists: [...store.getState().playlists, playlist] });
  return id;
}

export async function renamePlaylist(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (trimmed) editPlaylist(id, () => ({ name: trimmed }));
}

export async function deletePlaylist(id: string): Promise<void> {
  commit({ playlists: store.getState().playlists.filter((p) => p.id !== id) });
}

export async function addToPlaylist(id: string, tracks: AppTrack[]): Promise<void> {
  if (tracks.length) editPlaylist(id, (p) => ({ tracks: [...p.tracks, ...tracks] }));
}

export async function removeFromPlaylist(id: string, index: number): Promise<void> {
  const p = store.getState().playlists.find((x) => x.id === id);
  if (p && index >= 0 && index < p.tracks.length)
    editPlaylist(id, ({ tracks }) => ({ tracks: tracks.filter((_, i) => i !== index) }));
}

export async function reorderPlaylist(id: string, from: number, to: number): Promise<void> {
  const p = store.getState().playlists.find((x) => x.id === id);
  if (!p || from === to || !p.tracks[from] || to < 0 || to >= p.tracks.length) return;
  editPlaylist(id, ({ tracks }) => {
    const list = tracks.slice();
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    return { tracks: list };
  });
}
