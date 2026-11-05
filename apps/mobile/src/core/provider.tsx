import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';

import { resumeDownloads } from './downloads';
import { loadLibIndex } from './lib-index-load';
import { configureAudio, refreshQueueTracks } from './player/engine';
import { queryClient } from './query-client';
import { settingsStore } from './settings';

let started = false;

/** One-time, non-blocking startup: DB + migrations, library index, audio session, pending downloads. */
function startCore() {
  if (started) return;
  started = true;
  void configureAudio();
  loadLibIndex()
    .then(() => {
      refreshQueueTracks();
      return resumeDownloads();
    })
    .catch((e) => console.warn('[core] library init failed', e));
  settingsStore.subscribe((s, prev) => {
    if (s.serverUrl !== prev.serverUrl) refreshQueueTracks();
  });
}

export function CoreProvider({ children }: { children: ReactNode }) {
  useEffect(startCore, []);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
