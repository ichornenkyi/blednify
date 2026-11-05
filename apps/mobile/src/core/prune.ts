import { AppState } from 'react-native';

import { ApiError, apiGet, queryString } from './api';
import { getDb, writeTx } from './db';
import { removeTrackReferences } from './library';
import { libIndex } from './lib-index';
import { removeKeysFromQueue } from './player/engine';
import { playerStore } from './player/store';
import { invalidate, libKeys } from './query-client';
import { getServerBase, settingsStore } from './settings';

const CHUNK = 200;
const MIN_INTERVAL_MS = 5 * 60_000;

let running: Promise<number> | null = null;
let lastRun = 0;
/** Set once the server answers 404 (built before /api/tracks/gone); retried after a server change. */
let unsupportedBase: string | null = null;

/** Remote track keys the library or queue still references. Downloaded copies stay: they play offline. */
async function referencedRemoteKeys(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string }>(
    `SELECT key FROM likes WHERE key LIKE 'r:%'
     UNION SELECT key FROM recents WHERE key LIKE 'r:%'
     UNION SELECT key FROM playlist_tracks WHERE key LIKE 'r:%'`,
  );
  const keys = new Set(rows.map((r) => r.key));
  for (const t of playerStore.getState().queue) if (t.origin === 'remote') keys.add(t.key);
  const downloads = libIndex.getState().downloads;
  return [...keys].filter((k) => !downloads.has(k));
}

async function run(): Promise<number> {
  const base = getServerBase();
  if (!base || unsupportedBase === base) return 0;
  const keys = await referencedRemoteKeys();
  const gone: string[] = [];
  for (let i = 0; i < keys.length; i += CHUNK) {
    const ids = keys.slice(i, i + CHUNK).map((k) => k.slice(2));
    try {
      const r = await apiGet<{ gone: string[] }>(base, `/api/tracks/gone${queryString({ ids: ids.join(',') })}`);
      gone.push(...r.gone.map((id) => `r:${id}`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        unsupportedBase = base;
        break;
      }
      if (!gone.length) throw e;
      break;
    }
  }
  if (!gone.length) return 0;
  await writeTx((db) => removeTrackReferences(db, gone));
  invalidate(libKeys.all);
  removeKeysFromQueue(new Set(gone));
  return gone.length;
}

/**
 * Drops tracks the server deleted from likes, recents, playlists and the queue. The server only reports ids it
 * deleted itself, so pointing the app at another server never removes anything. Throttled unless `force`.
 */
export function pruneGoneTracks(force = false): Promise<number> {
  if (running) return running;
  if (!force && Date.now() - lastRun < MIN_INTERVAL_MS) return Promise.resolve(0);
  lastRun = Date.now();
  running = run()
    .catch((e) => {
      console.warn('[prune] failed', e);
      return 0;
    })
    .finally(() => {
      running = null;
    });
  return running;
}

let started = false;

/** Prunes now, on return to the foreground, on a server change, and after a streamed track fails to play. */
export function startPruning(): void {
  if (started) return;
  started = true;
  void pruneGoneTracks(true);
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void pruneGoneTracks();
  });
  settingsStore.subscribe((s, prev) => {
    if (s.serverUrl !== prev.serverUrl || s.accessToken !== prev.accessToken) void pruneGoneTracks(true);
  });
  playerStore.subscribe((s, prev) => {
    if (s.errorId !== prev.errorId && s.current?.origin === 'remote' && !s.current.localUri) void pruneGoneTracks(true);
  });
}
