import { useMemo } from 'react';
import { PixelRatio, Platform } from 'react-native';
import { useStore } from 'zustand';

import { sizedArtworkUrl } from './api';
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
  // Web: the session cookie authorises plain <img> loads (cached by the browser); headers would make
  // expo-image fetch every cover through JS instead.
  const headers = Platform.OS === 'web' ? undefined : authHeadersFor(uri);
  return headers ? { uri, headers } : { uri };
}

/**
 * Web: the URL of a cover sized for a slot `width` points wide. Browsers decode an image at its full size, so a
 * thumbnail showing a 3000px original holds ~36 MB each; the server keeps scaled copies. Native image views
 * downsample on their own and keep the original URL (one cache entry per cover).
 */
export function imageUriForWidth(uri: string, width: number | undefined): string {
  if (Platform.OS !== 'web' || !width) return uri;
  return sizedArtworkUrl(uri, Math.ceil(width * Math.min(PixelRatio.get(), 3)));
}

/**
 * Hook form: re-renders when the server or token changes, so cached image sources pick up new credentials.
 * `width` is the width the image is shown at, in points (see `imageUriForWidth`).
 */
export function useImageSource(uri: string | null | undefined, width?: number): ImageSource | null {
  const serverUrl = useStore(settingsStore, (s) => s.serverUrl);
  const accessToken = useStore(settingsStore, (s) => s.accessToken);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- credentials are read from the store; deps mark when to rebuild
  return useMemo(() => (uri ? imageSourceFor(imageUriForWidth(uri, width)) : null), [uri, width, serverUrl, accessToken]);
}
