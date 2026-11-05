import { open } from "node:fs/promises";
import type { TorrentFile } from "./torrent-match";

const REQUEST_TIMEOUT_MS = 20_000;
const METADATA_TIMEOUT_MS = 45_000;
const POLL_MS = 2_000;
const STALL_TIMEOUT_MS = 120_000;

type TorrentStatus = { hash: string; file_stats?: TorrentFile[] };

export class TorrServer {
  constructor(
    private readonly baseUrl: string,
    private readonly pollMs = POLL_MS,
  ) {}

  private async post(body: object, signal: AbortSignal): Promise<Response> {
    return fetch(`${this.baseUrl}/torrents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    });
  }

  private async json<T>(body: object, signal: AbortSignal): Promise<T> {
    const res = await this.post(body, signal);
    if (!res.ok) throw new Error(`TorrServer returned HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  /** Adds a torrent. `owned` is false when it was already in TorrServer, in which case the caller must leave it there. */
  async add(link: string, signal: AbortSignal): Promise<{ hash: string; owned: boolean }> {
    const existing = await this.json<TorrentStatus[]>({ action: "list" }, signal);
    const { hash } = await this.json<TorrentStatus>({ action: "add", link, title: "Blednify import", save_to_db: false }, signal);
    return { hash, owned: !existing.some((t) => t.hash === hash) };
  }

  /** The torrent's file list, once its metadata has arrived from peers. Null if that takes too long. */
  async files(hash: string, signal: AbortSignal): Promise<TorrentFile[] | null> {
    const deadline = Date.now() + METADATA_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const res = await this.post({ action: "get", hash }, signal);
      if (res.ok) {
        const { file_stats: files } = (await res.json()) as TorrentStatus;
        if (files?.length) return files;
      }
      await Bun.sleep(this.pollMs);
      signal.throwIfAborted();
    }
    return null;
  }

  async remove(hash: string): Promise<void> {
    await this.post({ action: "rem", hash }, AbortSignal.timeout(REQUEST_TIMEOUT_MS));
  }

  /** Saves one file to `dest`. Only that file's pieces are fetched, however large the torrent is. */
  async download(hash: string, file: TorrentFile, dest: string, signal: AbortSignal): Promise<void> {
    const stall = new AbortController();
    let timer = setTimeout(() => stall.abort(), STALL_TIMEOUT_MS);
    const out = await open(dest, "wx");
    try {
      const params = new URLSearchParams({ link: hash, index: String(file.id), play: "" });
      const res = await fetch(`${this.baseUrl}/stream/file?${params}`, { signal: AbortSignal.any([signal, stall.signal]) });
      if (!res.ok || !res.body) throw new Error(`TorrServer returned HTTP ${res.status}`);
      let received = 0;
      for await (const chunk of res.body) {
        clearTimeout(timer);
        timer = setTimeout(() => stall.abort(), STALL_TIMEOUT_MS);
        await out.appendFile(chunk);
        received += chunk.byteLength;
      }
      if (received !== file.length) throw new Error(`incomplete download (${received} of ${file.length} bytes)`);
    } catch (err) {
      if (stall.signal.aborted && !signal.aborted) throw new Error("download stalled: peers stopped sending data");
      throw err;
    } finally {
      clearTimeout(timer);
      await out.close();
    }
  }
}
