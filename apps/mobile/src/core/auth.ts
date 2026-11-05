import { useMemo } from 'react';
import { useStore } from 'zustand';

import { normalizeServerUrl, settingsStore } from './settings';

export type ImageSource = { uri: string; headers?: Record<string, string> };

/**
 * Headers that authorise a request for `url`, or undefined. The access token is only ever sent to the
 * configured server, never to other hosts or to local file:// URIs.
 */
export function authHeadersFor(url: string): Record<string, string> | undefined {
  const { serverUrl, accessToken } = settingsStore.getState();
  if (!accessToken) return undefined;
  const base = normalizeServerUrl(serverUrl);
  if (!base || (url !== base && !url.startsWith(`${base}/`))) return undefined;
  return { Authorization: `Bearer ${accessToken}` };
}

/** expo-image source for a URI, with the token attached when the URI is on the configured server. */
export function imageSourceFor(uri: string): ImageSource {
  const headers = authHeadersFor(uri);
  return headers ? { uri, headers } : { uri };
}

/** Hook form: re-renders when the server or token changes, so cached image sources pick up new credentials. */
export function useImageSource(uri: string | null | undefined): ImageSource | null {
  const serverUrl = useStore(settingsStore, (s) => s.serverUrl);
  const accessToken = useStore(settingsStore, (s) => s.accessToken);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- credentials are read from the store; deps mark when to rebuild
  return useMemo(() => (uri ? imageSourceFor(uri) : null), [uri, serverUrl, accessToken]);
}
