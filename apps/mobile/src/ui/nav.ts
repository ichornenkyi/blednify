import { router } from 'expo-router';

import type { Origin } from '@/core';

export const nav = {
  album: (id: string, origin: Origin) => router.push({ pathname: '/album/[id]', params: { id, origin } }),
  artist: (id: string, origin: Origin) => router.push({ pathname: '/artist/[id]', params: { id, origin } }),
  playlist: (id: string) => router.push({ pathname: '/playlist/[id]', params: { id } }),
  player: () => router.push('/player'),
  queue: () => router.push('/queue'),
  settings: () => router.push('/settings'),
  downloads: () => router.push('/downloads'),
  library: (filter?: LibraryFilter) => router.navigate({ pathname: '/library', params: filter ? { filter } : {} }),
};

export type LibraryFilter = 'playlists' | 'albums' | 'liked' | 'downloaded' | 'device';

export function parseOrigin(v: string | string[] | undefined): Origin {
  return v === 'local' ? 'local' : 'remote';
}
