import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { apiGet, apiWrite, type ApiTrack } from './api';
import { invalidate, queryClient } from './query-client';
import { getServerBase, settingsStore, useServerBase } from './settings';

export type ImportTrack = {
  videoId: string;
  title: string;
  artists: string[];
  album: string | null;
  durationMs: number | null;
  status: 'pending' | 'searching' | 'downloading' | 'done' | 'exists' | 'failed';
  error: string | null;
  trackId: ApiTrack['id'] | null;
};
export type ImportJob = {
  id: string;
  kind: 'playlist' | 'song';
  source: string;
  title: string;
  status: 'queued' | 'running' | 'done' | 'cancelled';
  createdAt: string;
  tracks: ImportTrack[];
};
type ApiImports = { enabled: boolean; items: ImportJob[] };

const POLL_MS = 3_000;
const START_TIMEOUT_MS = 120_000;
const CANCEL_TIMEOUT_MS = 12_000;
const CATALOG_KEYS = [['health'], ['tracks'], ['albums'], ['album'], ['artist'], ['search']];

const importsKey = (base: string) => ['imports', base];
const isActive = (job: ImportJob) => job.status === 'queued' || job.status === 'running';

/** Imports on the current server; polls while one runs and refreshes the catalog as tracks arrive. */
export function useImports(): { enabled: boolean; jobs: ImportJob[] } {
  const base = useServerBase();
  const { data } = useQuery({
    queryKey: importsKey(base),
    queryFn: ({ signal }) => apiGet<ApiImports>(base, '/api/imports', signal),
    enabled: !!base,
    retry: 0,
    refetchInterval: (q) => (q.state.data?.items.some(isActive) ? POLL_MS : false),
  });
  const jobs = data?.items;

  const added = jobs?.reduce((n, j) => n + j.tracks.filter((t) => t.status === 'done').length, 0) ?? 0;
  const lastAdded = useRef(added);
  useEffect(() => {
    if (added > lastAdded.current) invalidate(...CATALOG_KEYS);
    lastAdded.current = added;
  }, [added]);

  return { enabled: data?.enabled ?? false, jobs: jobs ?? [] };
}

/** `input` is a YouTube Music playlist link or a song name; the server tells them apart. */
export async function startImport(input: string): Promise<ImportJob | null> {
  const job = await apiWrite<ImportJob>(getServerBase(), 'POST', '/api/imports', {
    token: settingsStore.getState().adminToken,
    body: { input },
    timeoutMs: START_TIMEOUT_MS,
  });
  await queryClient.invalidateQueries({ queryKey: importsKey(getServerBase()) });
  return job;
}

/** Cancels an import that is still running, or dismisses a finished one. */
export async function discardImport(id: string): Promise<void> {
  await apiWrite(getServerBase(), 'DELETE', `/api/imports/${encodeURIComponent(id)}`, {
    token: settingsStore.getState().adminToken,
    timeoutMs: CANCEL_TIMEOUT_MS,
  });
  await queryClient.invalidateQueries({ queryKey: importsKey(getServerBase()) });
}
