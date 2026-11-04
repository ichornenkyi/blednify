import { create } from 'zustand';

import type { PlayerState } from '../types';

export const playerStore = create<PlayerState>(() => ({
  queue: [],
  index: -1,
  current: null,
  isPlaying: false,
  isBuffering: false,
  repeat: 'off',
  shuffle: false,
  error: null,
  errorId: 0,
}));

type Progress = { positionMs: number; durationMs: number };

/** Kept apart from `playerStore` so 4 Hz position updates only re-render progress UI. */
export const progressStore = create<Progress>(() => ({ positionMs: 0, durationMs: 0 }));

export function usePlayer<T>(selector: (s: PlayerState) => T): T {
  return playerStore(selector);
}

export function useProgress(): Progress {
  const positionMs = progressStore((s) => s.positionMs);
  const durationMs = progressStore((s) => s.durationMs);
  return { positionMs, durationMs };
}
