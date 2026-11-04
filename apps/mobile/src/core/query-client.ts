import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      retry: 1,
      // The server is often on a LAN that the OS considers "offline"; let requests fail fast instead of pausing.
      networkMode: 'always',
    },
  },
});

// Revalidate stale queries when the app returns to the foreground.
focusManager.setEventListener((setFocused) => {
  const sub = AppState.addEventListener('change', (s) => setFocused(s === 'active'));
  return () => sub.remove();
});

/** Local (SQLite) query keys — invalidated on mutation so hooks re-query. */
export const libKeys = {
  all: ['lib'] as const,
  local: ['lib', 'local'] as const,
  likes: ['lib', 'likes'] as const,
  recents: ['lib', 'recents'] as const,
  playlists: ['lib', 'playlists'] as const,
  playlist: (id: string) => ['lib', 'playlist', id] as const,
  album: (origin: string, id: string) => ['lib', 'album', origin, id] as const,
  artist: (origin: string, id: string) => ['lib', 'artist', origin, id] as const,
  search: (q: string) => ['lib', 'search', q] as const,
};

export function invalidate(...keys: readonly (readonly unknown[])[]): void {
  for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
}
