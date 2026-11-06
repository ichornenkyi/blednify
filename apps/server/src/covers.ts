import { randomUUID } from "node:crypto";
import { chmod, rename, rm, stat } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { parseFile } from "music-metadata";
import type { Library } from "./library";
import type { Scanner } from "./scanner";
import { isOtherVersion, isSameSong, normalize } from "./track-match";
import type { MusicResults, PlaylistTrack } from "./ytmusic";

export type CoverDeps = {
  lib: Library;
  scanner: Scanner;
  musicDir: string;
  searchMusic(query: string): Promise<MusicResults>;
  /** The image at `url`, or null when there is none. */
  fetchImage?(url: string, signal: AbortSignal): Promise<Buffer | null>;
  ffmpeg?: string;
};

/** Containers a cover can be added to without re-encoding the audio. */
const MUXERS: Record<string, string[]> = {
  ".m4a": ["-f", "ipod"],
  ".mp3": ["-f", "mp3", "-id3v2_version", "3"],
  ".flac": ["-f", "flac"],
};
const DURATION_TOLERANCE_MS = 15_000;
const MAX_DRIFT_S = 0.5;
const MIN_IMAGE_BYTES = 5_000;
/** Largest first: smaller ones are what YouTube serves when there is no bigger picture. */
const THUMBNAILS = ["maxresdefault", "hq720", "sddefault"];

async function fetchImage(url: string, signal: AbortSignal): Promise<Buffer | null> {
  const res = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) }).catch((err) => {
    signal.throwIfAborted();
    return null;
  });
  if (!res?.ok || !res.headers.get("content-type")?.startsWith("image/")) return null;
  const data = Buffer.from(await res.arrayBuffer());
  return data.byteLength >= MIN_IMAGE_BYTES ? data : null;
}

/** Adds the cover YouTube Music has for a song into the audio file itself, for songs that came without one. */
export class Covers {
  private busy = false;

  constructor(private readonly deps: CoverDeps) {}

  /** Tries every track that has no cover, or just the given tracks (whose cover is then replaced). `null` when a run is already going. */
  async fixMissing(signal: AbortSignal, only?: string[]): Promise<{ fixed: number; skipped: { title: string; artist: string; reason: string }[] } | null> {
    if (this.busy) return null;
    this.busy = true;
    try {
      const { lib } = this.deps;
      const rows = only ? only.flatMap((id) => lib.trackRow(id) ?? []) : lib.tracksWithoutArt();
      const skipped: { title: string; artist: string; reason: string }[] = [];
      let fixed = 0;
      for (const row of rows) {
        signal.throwIfAborted();
        const reason = await this.embed(row.id, signal).catch((err) => {
          signal.throwIfAborted();
          return (err as Error).message;
        });
        if (reason === null) fixed++;
        else skipped.push({ title: row.title, artist: row.artist, reason });
      }
      if (fixed > 0) await this.deps.scanner.scan();
      return { fixed, skipped };
    } finally {
      this.busy = false;
    }
  }

  /** Fixes one track and refreshes the library. Returns why it could not, if it could not. Never throws. */
  async fixTrack(id: string, signal: AbortSignal): Promise<string | null> {
    try {
      const reason = await this.embed(id, signal);
      if (reason === null) await this.deps.scanner.scan();
      return reason;
    } catch (err) {
      signal.throwIfAborted();
      return (err as Error).message;
    }
  }

  /** Returns why the track was left alone, or null once its file has a cover. */
  private async embed(id: string, signal: AbortSignal): Promise<string | null> {
    const { lib, musicDir, searchMusic } = this.deps;
    const row = lib.trackRow(id);
    if (!row) return "not in the library";
    const path = join(musicDir, row.path);
    const mux = MUXERS[extname(path).toLowerCase()];
    if (!mux) return `${extname(path)} files cannot hold a cover`;

    const { songs } = await searchMusic(`${row.artist} ${row.title}`);
    const same = songs.filter(
      (s) => isSameSong(s, row.title, row.artist) && !isOtherVersion(s.title, row.title) && (s.durationMs === null || Math.abs(s.durationMs - row.duration_ms) <= DURATION_TOLERANCE_MS),
    );
    // The same song is often on several releases (album, single, compilation) with different covers: take the file's own album first.
    const own = normalize(row.album);
    const words = (v: string) => normalize(v).split(" ").sort().join(" ");
    const album = (s: PlaylistTrack) => s.album ?? "";
    const match =
      same.find((s) => album(s) !== "" && normalize(album(s)) === own) ??
      same.find((s) => album(s) !== "" && words(album(s)) === words(row.album)) ??
      same.find((s) => album(s) !== "" && own !== "" && (normalize(album(s)).includes(own) || own.includes(normalize(album(s))))) ??
      same[0];
    if (!match) return "no matching song on YouTube Music";

    const read = this.deps.fetchImage ?? fetchImage;
    let image: Buffer | null = null;
    for (const name of THUMBNAILS) {
      image = await read(`https://i.ytimg.com/vi/${match.videoId}/${name}.jpg`, signal);
      if (image) break;
    }
    if (!image) return "YouTube Music has no cover for it";

    const dir = dirname(path);
    const tag = `.cover-${randomUUID()}`;
    const picture = join(dir, `${tag}.jpg`);
    const out = join(dir, `${tag}${extname(path)}`);
    try {
      await Bun.write(picture, image);
      // The thumbnail is a 16:9 frame with the square cover in the middle: crop it to a square.
      const args = [
        this.deps.ffmpeg ?? "ffmpeg", "-v", "error", "-y", "-i", path, "-i", picture,
        "-map", "0:a", "-map", "1:v", "-map_metadata", "0",
        "-c", "copy", "-c:v", "mjpeg", "-vf", "crop='min(iw,ih)':'min(iw,ih)'", "-disposition:v", "attached_pic",
        ...mux, out,
      ];
      const proc = Bun.spawn(args, { stdin: "ignore", stdout: "ignore", stderr: "pipe" });
      const kill = () => proc.kill();
      signal.addEventListener("abort", kill);
      const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]).finally(() => signal.removeEventListener("abort", kill));
      signal.throwIfAborted();
      if (code !== 0) return `could not add the cover: ${stderr.trim().split("\n").at(-1)?.replace(/\/\S+/g, "").slice(0, 120)}`;

      // Only replace the original when the copy is the same recording, with its tags, plus a picture.
      const [before, after] = await Promise.all([parseFile(path, { duration: true }), parseFile(out, { duration: true })]);
      const same = after.common.title === before.common.title && after.common.artist === before.common.artist && after.common.album === before.common.album;
      const drift = Math.abs((after.format.duration ?? 0) - (before.format.duration ?? 0));
      if (!after.common.picture?.length || !same || drift > MAX_DRIFT_S) return "the new file did not pass the check, so the original was kept";

      await chmod(out, (await stat(path)).mode & 0o777).catch(() => undefined);
      await rename(out, path);
      return null;
    } finally {
      await Promise.all([rm(picture, { force: true }), rm(out, { force: true })]);
    }
  }
}
