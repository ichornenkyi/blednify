import { existsSync, mkdirSync } from "node:fs";
import { readdir, realpath, stat } from "node:fs/promises";
import { basename, extname, join, relative, sep } from "node:path";
import { parseFile } from "music-metadata";
import type { ArtworkCache } from "./artwork";
import { albumId, artistId, audioMime, trackId, UNKNOWN_ALBUM, UNKNOWN_ARTIST } from "./ids";
import { toTrack, type Library, type Track, type TrackRow } from "./library";

export type ScanResult = { added: number; removed: number; total: number };

type FoundFile = { abs: string; rel: string; size: number; mtimeMs: number; birthMs: number };

const PARSE_CONCURRENCY = 4;
const BATCH = 200;

/** `a/b/c.mp3`, always `/`-separated so ids are stable across platforms. */
const toRel = (root: string, abs: string) => relative(root, abs).split(sep).join("/");

/** Recursively lists supported audio files; follows symlinks, skips dot-files/dirs, survives unreadable dirs. */
async function walk(root: string): Promise<FoundFile[]> {
  const out: FoundFile[] = [];
  const seenDirs = new Set<string>();
  const visit = async (dir: string): Promise<void> => {
    let real: string;
    try {
      real = await realpath(dir);
    } catch {
      return;
    }
    if (seenDirs.has(real)) return; // symlink loop
    seenDirs.add(real);
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      console.warn(`[scan] cannot read ${dir}: ${(err as Error).message}`);
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        await visit(abs);
        continue;
      }
      if (!e.isFile() && !e.isSymbolicLink()) continue;
      const isAudio = audioMime(e.name) !== null;
      if (e.isFile() && !isAudio) continue;
      try {
        const st = await stat(abs);
        if (st.isDirectory()) await visit(abs);
        else if (st.isFile() && isAudio)
          out.push({ abs, rel: toRel(root, abs), size: st.size, mtimeMs: Math.floor(st.mtimeMs), birthMs: st.birthtimeMs });
      } catch {
        // dangling symlink or file vanished mid-scan
      }
    }
  };
  await visit(root);
  return out;
}

/** "01 - Artist - Title" / "01. Title" / "Artist - Title" → parts. */
function parseFileName(path: string): { title: string; artist: string | null; trackNo: number | null } {
  let name = basename(path, extname(path)).replace(/_/g, " ").trim();
  let trackNo: number | null = null;
  const num = /^(\d{1,3})(?:\s*[-.)]\s*|\s+)(.+)$/.exec(name);
  if (num) {
    trackNo = Number(num[1]);
    name = num[2]!;
  }
  const dash = name.indexOf(" - ");
  if (dash > 0) return { artist: name.slice(0, dash).trim(), title: name.slice(dash + 3).trim() || name, trackNo };
  return { artist: null, title: name || basename(path), trackNo };
}

const clean = (s: string | undefined | null) => s?.replace(/\u0000/g, "").trim() || null;
const posInt = (n: number | null | undefined) => (n != null && Number.isInteger(n) && n > 0 ? n : null);

/** Reads tags + stream info and produces a DB row. Throws if the file is not parseable audio. */
async function readTrack(f: FoundFile, addedAt: string, strict = false): Promise<TrackRow> {
  const { common, format, quality } = await parseFile(f.abs, { duration: true });
  if (!format.container || !format.duration || format.duration <= 0) throw new Error("not an audio file");
  if (strict) {
    // Random bytes can masquerade as a few MPEG/ADTS frames: require the decoded stream to account for
    // a sane share of the file (excluding embedded pictures), and no flood of parser warnings.
    const pictureBytes = common.picture?.reduce((n, p) => n + p.data.byteLength, 0) ?? 0;
    const audioBytes = format.bitrate ? (format.duration * format.bitrate) / 8 : Number.POSITIVE_INFINITY;
    const lossyOverMax = /^(MPEG|ADTS)/.test(format.container) && (format.bitrate ?? 0) > 640_000;
    if (audioBytes < 0.25 * Math.max(1, f.size - pictureBytes) || lossyOverMax || quality.warnings.length >= 25)
      throw new Error("corrupt audio file");
  }
  const fromName = parseFileName(f.rel);
  const artist = clean(common.artist) ?? clean(common.artists?.join(", ")) ?? fromName.artist ?? UNKNOWN_ARTIST;
  const album = clean(common.album) ?? UNKNOWN_ALBUM;
  const albumArtist = clean(common.albumartist) ?? artist;
  const year = posInt(common.year);
  return {
    id: trackId(f.rel),
    path: f.rel,
    title: clean(common.title) ?? fromName.title,
    artist,
    artist_id: artistId(artist),
    album,
    album_id: albumId(albumArtist, album),
    album_artist: albumArtist,
    album_artist_id: artistId(albumArtist),
    duration_ms: Math.max(0, Math.round((format.duration ?? 0) * 1000)),
    track_no: posInt(common.track.no) ?? (common.title ? null : fromName.trackNo),
    disc_no: posInt(common.disk.no),
    year: year && year < 10000 ? year : null,
    genre: clean(common.genre?.[0]),
    mime: audioMime(f.abs)!,
    size: f.size,
    mtime_ms: f.mtimeMs,
    bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
    has_art: (common.picture?.length ?? 0) > 0 ? 1 : 0,
    added_at: addedAt,
  };
}

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]!);
    }),
  );
}

export class Scanner {
  private running: Promise<ScanResult> | null = null;
  private queued: Promise<ScanResult> | null = null;
  /** rel path → "size:mtime" of files that failed to parse; skipped until they change. */
  private readonly unreadable = new Map<string, string>();

  constructor(
    private readonly musicDir: string,
    private readonly lib: Library,
    private readonly art: ArtworkCache,
  ) {
    mkdirSync(musicDir, { recursive: true });
  }

  get scanning(): boolean {
    return this.running !== null;
  }

  /** Runs an incremental scan. Calls during a running scan coalesce into one follow-up scan. */
  scan(): Promise<ScanResult> {
    if (!this.running) {
      this.running = this.run().finally(() => {
        this.running = null;
      });
      return this.running;
    }
    this.queued ??= this.running
      .catch(() => undefined)
      .then(() => {
        this.queued = null;
        return this.scan();
      });
    return this.queued;
  }

  /** Indexes files immediately (uploads). All-or-nothing: throws before touching the DB if any file is unreadable. */
  async indexFiles(paths: string[]): Promise<Track[]> {
    const addedAt = new Date().toISOString();
    const rows: TrackRow[] = [];
    for (const abs of paths) {
      const st = await stat(abs);
      const f = { abs, rel: toRel(this.musicDir, abs), size: st.size, mtimeMs: Math.floor(st.mtimeMs), birthMs: 0 };
      try {
        rows.push(await readTrack(f, addedAt, true));
      } catch (err) {
        throw new Error(`${basename(abs)}: ${(err as Error).message}`);
      }
    }
    await Promise.all(rows.map((r) => this.art.invalidate(r.id)));
    this.lib.upsertTracks(rows);
    this.lib.rebuildAggregates();
    return rows.map(toTrack);
  }

  private async run(): Promise<ScanResult> {
    const started = performance.now();
    const files = await walk(this.musicDir);
    const known = this.lib.fileStates();
    const now = Date.now();

    const changed = files.filter((f) => {
      const k = known.get(f.rel);
      if (k) return k.size !== f.size || k.mtimeMs !== f.mtimeMs;
      return this.unreadable.get(f.rel) !== `${f.size}:${f.mtimeMs}`;
    });

    let added = 0;
    let failed = 0;
    let batch: TrackRow[] = [];
    const flush = () => {
      if (batch.length) added += this.lib.upsertTracks(batch).length;
      batch = [];
    };
    await pool(changed, PARSE_CONCURRENCY, async (f) => {
      // Best "date added" for a file we've never seen: its creation time (fallback mtime), never in the future.
      const created = f.birthMs > 0 ? f.birthMs : f.mtimeMs;
      try {
        const row = await readTrack(f, new Date(Math.min(created, now)).toISOString());
        this.unreadable.delete(f.rel);
        if (known.has(f.rel)) await this.art.invalidate(row.id);
        batch.push(row);
        if (batch.length >= BATCH) flush();
      } catch (err) {
        failed++;
        this.unreadable.set(f.rel, `${f.size}:${f.mtimeMs}`);
        console.warn(`[scan] skipped ${f.rel}: ${(err as Error).message}`);
      }
    });
    flush();

    // Rows whose file is gone. Re-check existence so files uploaded during the walk aren't dropped.
    const present = new Set(files.map((f) => f.rel));
    const gone = [...known].filter(([rel]) => !present.has(rel) && !existsSync(join(this.musicDir, rel)));
    this.lib.deleteTracks(gone.map(([, k]) => k.id));
    await Promise.all(gone.map(([, k]) => this.art.invalidate(k.id)));

    this.lib.rebuildAggregates();
    const result = { added, removed: gone.length, total: this.lib.trackCount() };
    const ms = Math.round(performance.now() - started);
    console.log(
      `[scan] ${files.length} files, ${changed.length} parsed, +${added} -${gone.length}` +
        `${failed ? `, ${failed} unreadable` : ""}, ${result.total} tracks in ${ms}ms`,
    );
    return result;
  }
}
