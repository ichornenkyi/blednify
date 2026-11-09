/** Web output volume: applied to the shared <audio> element and remembered across visits. */
import { create } from 'zustand';

import { kv } from '../settings';
import { audioElement } from './audio.web';

export type VolumeState = { volume: number; muted: boolean };

const KEY = 'player.volume.v1';

function load(): VolumeState {
  try {
    const raw = kv.getString(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<VolumeState>;
      const volume = typeof v.volume === 'number' && Number.isFinite(v.volume) ? Math.min(1, Math.max(0, v.volume)) : 1;
      return { volume, muted: v.muted === true };
    }
  } catch {
    // Corrupt value: fall back to full volume.
  }
  return { volume: 1, muted: false };
}

export const volumeSupported = true;
export const volumeStore = create<VolumeState>(load);

function apply({ volume, muted }: VolumeState) {
  if (typeof document === 'undefined') return;
  const el = audioElement();
  // Perceptual curve: a linear gain makes the top half of the slider sound the same.
  el.volume = volume * volume;
  el.muted = muted;
}

apply(volumeStore.getState());
volumeStore.subscribe((s) => {
  apply(s);
  kv.set(KEY, JSON.stringify(s));
});

export function setVolume(volume: number) {
  const v = Math.min(1, Math.max(0, volume));
  // Dragging up from silence unmutes, like every desktop player.
  volumeStore.setState({ volume: v, muted: v === 0 ? volumeStore.getState().muted : false });
}

export function toggleMute() {
  const { muted, volume } = volumeStore.getState();
  if (muted || volume === 0) volumeStore.setState({ muted: false, volume: volume === 0 ? 0.5 : volume });
  else volumeStore.setState({ muted: true });
}
