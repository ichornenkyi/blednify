import type { AppTrack, DownloadStatus } from './types';

/** Streaming only on web (see `supportsOffline`); the UI hides these actions, so they are inert. */
const NONE = { status: 'none' as DownloadStatus, progress: 0 };
const NO_DOWNLOADS = { active: [], completedCount: 0, bytesUsed: 0 };

export function downloadTracks(_tracks: AppTrack[]): void {}
export function cancelDownload(_key: string): void {}
export async function removeDownload(_key: string): Promise<void> {}
export async function resumeDownloads(): Promise<void> {}
export const useDownloadState = (_key: string): typeof NONE => NONE;
export const useDownloads = (): {
  active: { track: AppTrack; status: DownloadStatus; progress: number }[];
  completedCount: number;
  bytesUsed: number;
} => NO_DOWNLOADS;
