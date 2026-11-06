import { readdir, rm } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import type { PlaylistTrack } from "./ytmusic";

/** Saves a track's audio straight from its source, with no search. */
export interface AudioSource {
  /** Writes the track's audio, tagged with its title, artist and album, to `dest` (an `.m4a` path). */
  download(track: PlaylistTrack, dest: string, signal: AbortSignal): Promise<void>;
}

const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
const VIDEO_ID = /^[\w-]{11}$/;

type Run = { code: number; output: string };

async function run(cmd: string[], signal: AbortSignal): Promise<Run> {
  const proc = Bun.spawn(cmd, { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const stop = AbortSignal.any([signal, AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)]);
  const kill = () => proc.kill();
  stop.addEventListener("abort", kill);
  try {
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    signal.throwIfAborted();
    if (stop.aborted) throw new Error("the download took too long");
    return { code, output: `${stdout}\n${stderr}` };
  } finally {
    stop.removeEventListener("abort", kill);
  }
}

/** The last line yt-dlp or ffmpeg complained about, without paths. */
function reason(output: string): string {
  const lines = output.split("\n").map((l) => l.trim()).filter(Boolean);
  const line = [...lines].reverse().find((l) => /^ERROR:/i.test(l)) ?? lines.at(-1) ?? "unknown error";
  return line.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/i, "").replace(/\/\S+/g, "").slice(0, 160).trim();
}

/** Downloads the exact YouTube Music video behind a track with yt-dlp, then tags it with ffmpeg. */
export class YtDlp implements AudioSource {
  constructor(
    private readonly bin: string,
    private readonly ffmpeg = "ffmpeg",
  ) {}

  async download(track: PlaylistTrack, dest: string, signal: AbortSignal): Promise<void> {
    if (!VIDEO_ID.test(track.videoId)) throw new Error("the song has no YouTube Music id");
    // The scratch file shares the importer's temp prefix, so a crash mid-download is cleaned up on the next run.
    const stem = `${dest}.dl`;
    try {
      const dl = await run(
        [
          this.bin,
          "--no-playlist", "--no-progress", "--no-warnings", "--no-config",
          "--js-runtimes", "bun",
          "-f", "bestaudio[ext=m4a]/bestaudio",
          "--write-thumbnail", "--convert-thumbnails", "jpg",
          "-o", `${stem}.%(ext)s`,
          "--", `https://music.youtube.com/watch?v=${track.videoId}`,
        ],
        signal,
      );
      const files = (await readdir(dirname(dest))).filter((n) => n.startsWith(`${basename(stem)}.`));
      const name = files.find((n) => !n.endsWith(".jpg"));
      if (dl.code !== 0 || !name) throw new Error(`YouTube Music: ${reason(dl.output)}`);
      const source = join(dirname(dest), name);
      const cover = files.find((n) => n.endsWith(".jpg"));

      // AAC from YouTube Music is copied as is; anything else (Opus) is converted so every device can play it.
      const codec = extname(name).toLowerCase() === ".m4a" ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "192k"];
      const meta = [["title", track.title], ["artist", track.artists.join(", ")], ["album", track.album ?? ""]].flatMap(([k, v]) =>
        v ? ["-metadata", `${k}=${v}`] : [],
      );
      // The thumbnail is a 16:9 frame with the square cover in the middle: crop it to a square and attach it.
      const art = cover
        ? ["-i", join(dirname(dest), cover), "-map", "0:a", "-map", "1:v", "-c:v", "mjpeg", "-vf", "crop='min(iw,ih)':'min(iw,ih)'", "-disposition:v", "attached_pic"]
        : ["-vn"];
      const tag = await run([this.ffmpeg, "-v", "error", "-y", "-i", source, ...art, ...codec, ...meta, "-f", "ipod", dest], signal);
      if (tag.code !== 0) throw new Error(`could not convert the download: ${reason(tag.output)}`);
    } finally {
      const dir = dirname(dest);
      const leftovers = (await readdir(dir).catch(() => [])).filter((n) => n.startsWith(`${basename(stem)}.`));
      await Promise.all(leftovers.map((n) => rm(join(dir, n), { force: true })));
    }
  }
}
