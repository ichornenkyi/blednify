import { router } from 'expo-router';

import type { Origin } from '@/core';

export const nav = {
  album: (id: string, origin: Origin) => router.push({ pathname: '/album/[id]', params: { id, origin } }),
  artist: (id: string, origin: Origin) => router.push({ pathname: '/artist/[id]', params: { id, origin } }),
  playlist: (id: string) => router.push({ pathname: '/playlist/[id]', params: { id } }),
  player: () => router.push('/player'),
  queue: () => router.push('/queue'),
  lyrics: () => router.push('/lyrics'),
  upload: () => router.push('/upload'),
  importPlaylist: () => router.push('/import'),
  settings: () => router.push('/settings'),
  downloads: () => router.push('/downloads'),
  /** From a root-stack screen, pop back to the existing tabs instead of stacking a second tab navigator. */
  library: (filter?: LibraryFilter) => {
    const href = { pathname: '/library', params: filter ? { filter } : {} } as const;
    if (router.canDismiss()) router.dismissTo(href);
    else router.navigate(href);
  },
};

export type LibraryFilter = 'playlists' | 'recents' | 'albums' | 'liked' | 'downloaded' | 'device';

export function parseOrigin(v: string | string[] | undefined): Origin {
  return v === 'local' ? 'local' : 'remote';
}
