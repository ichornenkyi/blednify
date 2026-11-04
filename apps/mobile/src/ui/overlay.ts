import type { ReactNode } from 'react';
import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error' | 'progress';
export type ToastData = { id: number; message: string; kind: ToastKind };

type OverlayState = {
  sheet: { id: number; content: ReactNode } | null;
  toast: ToastData | null;
};

export const useOverlay = create<OverlayState>(() => ({ sheet: null, toast: null }));

let seq = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Present arbitrary content in the global bottom sheet. Replaces any open sheet. */
export function showSheet(content: ReactNode) {
  useOverlay.setState({ sheet: { id: ++seq, content } });
}

export function closeSheet() {
  useOverlay.setState({ sheet: null });
}

/**
 * Show a toast. `progress` toasts stay until replaced or dismissed; others auto-hide.
 * Returns the toast id so callers can dismiss exactly their own toast.
 */
export function showToast(message: string, kind: ToastKind = 'info'): number {
  clearTimeout(toastTimer);
  const id = ++seq;
  useOverlay.setState({ toast: { id, message, kind } });
  if (kind !== 'progress') {
    toastTimer = setTimeout(() => dismissToast(id), kind === 'error' ? 4000 : 2400);
  }
  return id;
}

export function dismissToast(id?: number) {
  const { toast } = useOverlay.getState();
  if (toast && (id === undefined || toast.id === id)) useOverlay.setState({ toast: null });
}
