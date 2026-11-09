/**
 * Web only: trade the listen token for the server's HttpOnly cookie (POST /api/session), because <audio>
 * and <img> cannot send an Authorization header. No-op on native and when no token is set.
 */
import { Platform } from 'react-native';

import { getServerBase, settingsStore } from './settings';

let last = '';

export async function syncWebSession(): Promise<void> {
  if (Platform.OS !== 'web') return;
  const base = getServerBase();
  const { accessToken } = settingsStore.getState();
  const key = `${base}\n${accessToken}`;
  if (!base || key === last) return;
  last = key;
  try {
    const res = await fetch(`${base}/api/session`, {
      method: accessToken ? 'POST' : 'DELETE',
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
    if (!res.ok && res.status !== 404) last = '';
  } catch (e) {
    last = '';
    console.warn('[web] session cookie', e);
  }
}
