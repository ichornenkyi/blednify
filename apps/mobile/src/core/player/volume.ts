/**
 * Output volume. Native apps use the hardware volume keys, so this is a no-op there; the web build
 * (`volume.web.ts`) drives the page's <audio> element.
 */
import { create } from 'zustand';

export type VolumeState = { volume: number; muted: boolean };

export const volumeSupported = false;
export const volumeStore = create<VolumeState>(() => ({ volume: 1, muted: false }));

export function setVolume(_volume: number) {}
export function toggleMute() {}
