import { Alert, Platform } from 'react-native';

import { deleteLocalTrack, deleteServerTrack, importFromDevice, type AppTrack } from '@/core';

import { haptics } from './haptics';
import { dismissToast, showToast } from './overlay';

export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return typeof e === 'string' && e ? e : 'Something went wrong';
}

/** Await a core mutation, surfacing failures as an error toast and success as an optional toast. */
export async function attempt<T>(task: Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const result = await task;
    if (success) showToast(success, 'success');
    return result;
  } catch (e) {
    haptics.warn();
    showToast(errorMessage(e), 'error');
    return undefined;
  }
}

let importing = false;

/** Opens the system picker and imports audio files with progress + result toasts. */
export async function importMusic() {
  if (importing) return;
  importing = true;
  const toastId = showToast('Importing music…', 'progress');
  try {
    const { imported, skipped } = await importFromDevice();
    dismissToast(toastId);
    if (imported === 0 && skipped === 0) return; // picker cancelled
    haptics.success();
    const parts = [`Imported ${imported} ${imported === 1 ? 'track' : 'tracks'}`];
    if (skipped > 0) parts.push(`${skipped} skipped`);
    showToast(parts.join(' · '), imported > 0 ? 'success' : 'info');
  } catch (e) {
    dismissToast(toastId);
    haptics.warn();
    showToast(errorMessage(e), 'error');
  } finally {
    importing = false;
  }
}

/** `Alert.alert` is a silent no-op on web, so fall back to the browser's confirm dialog there. */
export function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

export function confirmDeleteLocal(track: AppTrack) {
  Alert.alert('Delete from device?', `“${track.title}” will be removed from this phone.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => void attempt(deleteLocalTrack(track.key), 'Deleted from device') },
  ]);
}

export function confirmDeleteRemote(track: AppTrack) {
  confirmAction(
    'Delete from server?',
    `“${track.title}” will be permanently deleted from your music server for every device.`,
    'Delete',
    () => void attempt(deleteServerTrack(track.key), 'Deleted from server'),
  );
}
