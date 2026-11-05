import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { parseFile } from "music-metadata";
import type { Db } from "./db";
import type { TrackRow } from "./library";

export type LyricLine = { timeMs: number; text: string };
export type LyricsSource = "file" | "embedded" | "lrclib";
export type Lyrics = {
  /** Time-synced lines, sorted by time (null when only plain text is known). */
  synced: LyricLine[] | null;
  /** Plain text, lines separated by "\n" (derived from `synced` when only synced lyrics exist). */
  plain: string | null;
  /** The track is known to have no vocals. */
  instrumental: boolean;
  source: LyricsSource | null;
};

export const NO_LYRICS: Lyrics = { synced: null, plain: null, instrumental: false, source: null };

const MAX_TEXT = 200_000;

/** True when the text has at least one `[mm:ss.xx]` line tag. */
export function isLrc(text: string): boolean {
  return /^\s*(\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\])+/m.test(text);
}

/**
 * Parses LRC: `[mm:ss.xx]` tags (several per line allowed), `[offset:+/-ms]`, metadata tags ignored and
 * enhanced word tags `<mm:ss.xx>` stripped. Returns null when no timed line is found.
 */
export function parseLrc(text: string): LyricLine[] | null {
  let offset = 0;
  const out: LyricLine[] = [];
  for (const raw of text.slice(0, MAX_TEXT).split(/\r\n|\r|\n/)) {
    const off = /^\s*\[offset:\s*([+-]?\d+)\s*\]/i.exec(raw);
    if (off) {
      offset = Number(off[1]);
      continue;
    }
    const times: number[] = [];
    let rest = raw.trimStart();
    for (;;) {
      const m = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/.exec(rest);
      if (!m) break;
      const frac = m[3] ? Number(m[3].padEnd(3, "0")) : 0;
      times.push(Number(m[1]) * 60_000 + Number(m[2]) * 1000 + frac);
      rest = rest.slice(m[0].length);
    }
    if (!times.length) continue;
    const line = rest.replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, "").trim();
    for (const t of times) out.push({ timeMs: Math.max(0, t - offset), text: line });
  }
  if (!out.some((l) => l.text)) return null;
  out.sort((a, b) => a.timeMs - b.timeMs);
  return out;
}

const plainFromSynced = (lines: LyricLine[]) => lines.map((l) => l.text).join("\n").replace(/\n{3,}/g, "\n\n").trim();

/** Lyrics from free text: LRC when it has time tags, plain otherwise. */
export function lyricsFromText(text: string, source: LyricsSource): Lyrics | null {
  const t = text.replace(/^﻿/, "").replace(/\u0000/g, "").trim();
  if (!t) return null;
  if (isLrc(t)) {
    const synced = parseLrc(t);
    if (synced) return { synced, plain: plainFromSynced(synced), instrumental: false, source };
  }
  return { synced: null, plain: t.slice(0, MAX_TEXT).replace(/\r\n?/g, "\n"), instrumental: false, source };
}

/** `song.flac` → `song.lrc` / `song.txt` next to it. */
async function sidecar(abs: string): Promise<Lyrics | null> {
  const stem = abs.slice(0, abs.length - extname(abs).length);
  for (const ext of [".lrc", ".LRC", ".txt"]) {
    try {
      const text = await readFile(stem + ext, "utf8");
      const l = lyricsFromText(text, "file");
      if (l) return l;
    } catch {
      // not there
    }
  }
  return null;
}

/** USLT / SYLT (ID3), LYRICS / UNSYNCEDLYRICS (Vorbis), ©lyr (MP4). */
async function embedded(abs: string): Promise<Lyrics | null> {
  const tags = await parseFile(abs, { skipCovers: true, duration: false }).then(
    (m) => m.common.lyrics,
    () => undefined,
  );
  if (!tags?.length) return null;
  for (const tag of tags) {
    const sync = tag.syncText?.filter((l) => typeof l.timestamp === "number");
    if (sync && sync.length > 1) {
      const synced = sync
        .map((l) => ({ timeMs: Math.max(0, Math.round(l.timestamp!)), text: (l.text ?? "").trim() }))
        .sort((a, b) => a.timeMs - b.timeMs);
      return { synced, plain: plainFromSynced(synced), instrumental: false, source: "embedded" };
    }
  }
  for (const tag of tags) {
    const text = tag.text ?? tag.syncText?.map((l) => l.text).join("\n");
    const l = text ? lyricsFromText(text, "embedded") : null;
    if (l) return l;
  }
  return null;
}

type LrclibHit = { instrumental?: boolean; plainLyrics?: string | null; syncedLyrics?: string | null };

export type LyricsOptions = {
  /** Look up lyrics on lrclib.net when the file has none (results, including misses, are cached). */
  online: boolean;
  /** Base URL of the LRCLIB API (tests point it elsewhere). */
  lrclibUrl: string;
  fetch?: typeof fetch;
};

const HIT_TTL_MS = 180 * 86_400_000;
const MISS_TTL_MS = 7 * 86_400_000;
const ERROR_TTL_MS = 30 * 60_000;
const ONLINE_TIMEOUT_MS = 8_000;
const USER_AGENT = "Blednify (self-hosted music server; https://github.com/vetos5/blednify)";

/** Finds lyrics for a track: sidecar file → embedded tag → LRCLIB (cached in the DB). */
export class LyricsService {
  private readonly inflight = new Map<string, Promise<Lyrics>>();

  constructor(
    private readonly db: Db,
    private readonly opts: LyricsOptions,
  ) {
    db.sql.exec(`CREATE TABLE IF NOT EXISTS lyrics_cache (
      track_id   TEXT PRIMARY KEY,
      sig        TEXT NOT NULL,
      body       TEXT,
      expires_at INTEGER NOT NULL
    ) WITHOUT ROWID`);
  }

  get(row: TrackRow, abs: string): Promise<Lyrics> {
    const running = this.inflight.get(row.id);
    if (running) return running;
    const p = this.find(row, abs).finally(() => this.inflight.delete(row.id));
    this.inflight.set(row.id, p);
    return p;
  }

  forget(id: string): void {
    this.db.sql.query("DELETE FROM lyrics_cache WHERE track_id = ?").run(id);
  }

  private async find(row: TrackRow, abs: string): Promise<Lyrics> {
    const local = (await sidecar(abs)) ?? (await embedded(abs));
    if (local) return local;
    if (!this.opts.online) return NO_LYRICS;
    return this.online(row);
  }

  private async online(row: TrackRow): Promise<Lyrics> {
    const sig = `${row.artist}\u0000${row.title}\u0000${row.album}\u0000${Math.round(row.duration_ms / 1000)}`;
    const cached = this.db.sql
      .query<{ sig: string; body: string | null; expires_at: number }, [string]>(
        "SELECT sig, body, expires_at FROM lyrics_cache WHERE track_id = ?",
      )
      .get(row.id);
    if (cached && cached.sig === sig && cached.expires_at > Date.now()) {
      return cached.body ? (JSON.parse(cached.body) as Lyrics) : NO_LYRICS;
    }
    let result: Lyrics | null;
    let ttl: number;
    try {
      result = await this.lookup(row);
      ttl = result ? HIT_TTL_MS : MISS_TTL_MS;
    } catch (err) {
      console.warn(`[lyrics] lrclib lookup failed for ${row.id}: ${(err as Error).message}`);
      result = null;
      ttl = ERROR_TTL_MS;
    }
    this.db.sql
      .query("INSERT OR REPLACE INTO lyrics_cache (track_id, sig, body, expires_at) VALUES (?, ?, ?, ?)")
      .run(row.id, sig, result ? JSON.stringify(result) : null, Date.now() + ttl);
    return result ?? NO_LYRICS;
  }

  private async lookup(row: TrackRow): Promise<Lyrics | null> {
    if (!row.title || row.artist === "Unknown Artist") return null;
    const doFetch = this.opts.fetch ?? fetch;
    const req = async (path: string, params: Record<string, string>): Promise<Response> => {
      const qs = new URLSearchParams(params).toString();
      return doFetch(`${this.opts.lrclibUrl}${path}?${qs}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(ONLINE_TIMEOUT_MS),
      });
    };
    const params: Record<string, string> = { artist_name: row.artist, track_name: row.title };
    if (row.album && row.album !== "Unknown Album") params.album_name = row.album;
    if (row.duration_ms > 0) params.duration = String(Math.round(row.duration_ms / 1000));

    const res = await req("/api/get", params);
    let hit: LrclibHit | null = null;
    if (res.ok) hit = (await res.json()) as LrclibHit;
    else if (res.status !== 404) throw new Error(`HTTP ${res.status}`);
    if (!hit) {
      // Exact match failed (album or duration differ): search and take the closest duration within 5 s.
      const s = await req("/api/search", { artist_name: row.artist, track_name: row.title });
      if (!s.ok) throw new Error(`HTTP ${s.status}`);
      const items = ((await s.json()) as (LrclibHit & { duration?: number })[]) ?? [];
      const target = row.duration_ms / 1000;
      hit =
        items
          .filter((h) => !target || (typeof h.duration === "number" && Math.abs(h.duration - target) <= 5))
          .sort((a, b) => Number(!!b.syncedLyrics) - Number(!!a.syncedLyrics))[0] ?? null;
    }
    if (!hit) return null;
    if (hit.instrumental) return { synced: null, plain: null, instrumental: true, source: "lrclib" };
    if (hit.syncedLyrics) {
      const l = lyricsFromText(hit.syncedLyrics, "lrclib");
      if (l?.synced) return hit.plainLyrics ? { ...l, plain: hit.plainLyrics.trim() } : l;
    }
    return hit.plainLyrics ? lyricsFromText(hit.plainLyrics, "lrclib") : null;
  }
}
