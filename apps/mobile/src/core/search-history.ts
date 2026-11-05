/**
 * Recent-search history.
 *
 * Storage: MMKV (`kv`) under a single JSON key — fast synchronous reads, no migration needed,
 * total payload is small (<20 items × ~200 bytes each = well under 4 KB). Zustand makes the
 * store subscribable so the UI re-renders automatically on mutations.
 *
 * Stored entry kinds (most-recent-first):
 *   - 'query'  : a submitted text string the user typed
 *   - 'track'  : a track the user tapped from results
 *   - 'album'  : an album the user tapped from results
 *   - 'artist' : an artist the user tapped from results
 */
import { create } from 'zustand';

import { kv } from './settings';
import { fromStorable, toStorable } from './tracks';
import type { AlbumView, AppTrack, ArtistView } from './types';

export type SearchHistoryTrack = {
  kind: 'track';
  id: string; // track.key — dedupe key
  track: AppTrack;
};

export type SearchHistoryAlbum = {
  kind: 'album';
  id: string; // `album:${origin}:${id}`
  album: AlbumView;
};

export type SearchHistoryArtist = {
  kind: 'artist';
  id: string; // `artist:${origin}:${id}`
  artist: ArtistView;
};

export type SearchHistoryQuery = {
  kind: 'query';
  id: string; // `query:${trimmedQuery.toLowerCase()}`
  query: string;
};

export type SearchHistoryEntry =
  | SearchHistoryTrack
  | SearchHistoryAlbum
  | SearchHistoryArtist
  | SearchHistoryQuery;

const KV_KEY = 'searchHistory.v1';
const MAX_ENTRIES = 20;

function load(): SearchHistoryEntry[] {
  try {
    const raw = kv.getString(KV_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((e: SearchHistoryEntry) => {
      if (!e || typeof e !== 'object' || !('kind' in e)) return [];
      if (e.kind === 'track' && e.track) {
        return [{ ...e, track: fromStorable(e.track) }];
      }
      return [e];
    });
  } catch {
    return [];
  }
}

function save(entries: SearchHistoryEntry[]) {
  try {
    const storable = entries.map((e) => {
      if (e.kind === 'track') {
        return { ...e, track: toStorable(e.track) };
      }
      return e;
    });
    kv.set(KV_KEY, JSON.stringify(storable));
  } catch {
    // best-effort
  }
}

type SearchHistoryState = {
  entries: SearchHistoryEntry[];
};

export const searchHistoryStore = create<SearchHistoryState>(() => ({
  entries: load(),
}));

function push(entry: SearchHistoryEntry) {
  const current = searchHistoryStore.getState().entries;
  // Dedupe by id — remove any existing entry with the same id, then prepend.
  const filtered = current.filter((e) => e.id !== entry.id);
  const next = [entry, ...filtered].slice(0, MAX_ENTRIES);
  save(next);
  searchHistoryStore.setState({ entries: next });
}

/** Record a submitted search query string. */
export function pushSearchQuery(query: string): void {
  const q = query.trim();
  if (!q) return;
  push({ kind: 'query', id: `query:${q.toLowerCase()}`, query: q });
}

/** Record a tapped track result. */
export function pushSearchTrack(track: AppTrack): void {
  push({ kind: 'track', id: track.key, track });
}

/** Record a tapped album result. */
export function pushSearchAlbum(album: AlbumView): void {
  push({ kind: 'album', id: `album:${album.origin}:${album.id}`, album });
}

/** Record a tapped artist result. */
export function pushSearchArtist(artist: ArtistView): void {
  push({ kind: 'artist', id: `artist:${artist.origin}:${artist.id}`, artist });
}

/** Remove a single history entry by its id. */
export function removeSearchEntry(id: string): void {
  const current = searchHistoryStore.getState().entries;
  const next = current.filter((e) => e.id !== id);
  save(next);
  searchHistoryStore.setState({ entries: next });
}

/** Remove all history entries. */
export function clearSearchHistory(): void {
  kv.remove(KV_KEY);
  searchHistoryStore.setState({ entries: [] });
}

/** Subscribable hook — re-renders whenever history changes. */
export function useSearchHistory(): SearchHistoryEntry[] {
  return searchHistoryStore((s) => s.entries);
}
