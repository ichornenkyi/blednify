import { getDocumentAsync } from 'expo-document-picker';
import { Platform } from 'react-native';

import { ApiError } from './api';
import { queryClient } from './query-client';
import { getServerBase, settingsStore } from './settings';
import { errorMessage } from './util';

export type UploadResult = { uploaded: number; failed: number; error?: string };

/** Pick audio files and upload them to the music server (admin token required), one request per file. */
export async function uploadToServer(onProgress?: (done: number, total: number) => void): Promise<UploadResult> {
  const base = getServerBase();
  if (!base) throw new ApiError('No server configured');
  const { adminToken } = settingsStore.getState();
  if (!adminToken) throw new ApiError('Set the admin token in Settings first');

  const picked = await getDocumentAsync({ type: 'audio/*', multiple: true, copyToCacheDirectory: true });
  if (picked.canceled || !picked.assets.length) return { uploaded: 0, failed: 0 };

  const assets = picked.assets;
  let uploaded = 0;
  let processed = 0;
  let error: string | undefined;
  onProgress?.(0, assets.length);
  for (const asset of assets) {
    try {
      const form = new FormData();
      const name = asset.name || 'track';
      if (Platform.OS === 'web' && asset.file) form.append('file', asset.file, name);
      else form.append('file', { uri: asset.uri, name, type: asset.mimeType ?? 'audio/mpeg' } as unknown as Blob);
      const res = await fetch(`${base}/api/tracks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, Accept: 'application/json' },
        body: form,
      });
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { error?: unknown };
          if (typeof body?.error === 'string') message = body.error;
        } catch {
          // keep status text
        }
        if (res.status === 401 || res.status === 403) message = 'Admin token rejected by the server';
        throw new ApiError(message, res.status);
      }
      uploaded++;
    } catch (e) {
      error ??= `${asset.name}: ${errorMessage(e)}`;
    }
    onProgress?.(++processed, assets.length);
  }
  if (uploaded) void queryClient.invalidateQueries();
  return { uploaded, failed: assets.length - uploaded, error };
}
