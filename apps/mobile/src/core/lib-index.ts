import { create } from 'zustand';

export type DownloadEntry = { file: string; art: string | null; size: number };

type LibIndex = {
  ready: boolean;
  /** Keys of liked tracks — synchronous lookups for `useIsLiked`. */
  liked: ReadonlySet<string>;
  /** Completed downloads by track key (relative paths) — used to resolve `streamUri`/`localUri`. */
  downloads: ReadonlyMap<string, DownloadEntry>;
};

export const libIndex = create<LibIndex>(() => ({ ready: false, liked: new Set(), downloads: new Map() }));

export function setLiked(key: string, liked: boolean): void {
  const next = new Set(libIndex.getState().liked);
  if (liked) next.add(key);
  else next.delete(key);
  libIndex.setState({ liked: next });
}

export function setDownload(key: string, entry: DownloadEntry | null): void {
  const next = new Map(libIndex.getState().downloads);
  if (entry) next.set(key, entry);
  else next.delete(key);
  libIndex.setState({ downloads: next });
}
