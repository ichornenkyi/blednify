/**
 * Web persistence for likes, recents and playlists (imported by `*.web.ts` only). It uses the same
 * localStorage-backed `kv` as settings rather than expo-sqlite, whose web storage (OPFS) needs a secure
 * context and so would not work when the server is reached over plain http on a LAN.
 */
import { kv } from './settings';
import type { AppTrack } from './types';

export type WebPlaylist = { id: string; name: string; createdAt: string; updatedAt: string; tracks: AppTrack[] };
export type WebLibrary = {
  /** Newest first. */
  likes: { track: AppTrack; at: number }[];
  /** Newest first. */
  recents: { track: AppTrack; at: number }[];
  playlists: WebPlaylist[];
};

export const LIBRARY_KEY = 'library.v1';

export function readLibrary(): WebLibrary {
  const raw = kv.getString(LIBRARY_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as WebLibrary;
    } catch (e) {
      console.warn('[library] could not read the saved library', e);
    }
  }
  return { likes: [], recents: [], playlists: [] };
}

/** Throws if browser storage is full, so callers keep their previous state and report the failure. */
export const writeLibrary = (lib: WebLibrary): void => kv.set(LIBRARY_KEY, JSON.stringify(lib));
