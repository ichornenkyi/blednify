import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { parseFile } from "music-metadata";
import type { Library, Track } from "./library";
import type { Scanner } from "./scanner";
import { cleanTitle, isSameSong } from "./track-match";
import type { AudioSource } from "./ytdlp";
import type { Album, Playlist, PlaylistTrack } from "./ytmusic";

export type ImportTrackStatus = "pending" | "downloading" | "done" | "exists" | "failed";
export type ImportTrack = PlaylistTrack & { status: ImportTrackStatus; error: string | null; trackId: string | null };
export type ImportJob = {
  id: string;
  kind: "playlist" | "album" | "song";
  /** The YouTube Music id of the playlist, album or song. */
  source: string;
  title: string;
  status: "queued" | "running" | "done" | "cancelled";
  createdAt: string;
  tracks: ImportTrack[];
};

export class NothingFoundError extends Error {}

const MAX_KEPT_JOBS = 20;
const DURATION_TOLERANCE_MS = 15_000;
const TMP_PREFIX = ".import-";

export type ImporterDeps = {
  lib: Library;
  scanner: Scanner;
  /** Adds a cover to songs that arrive without one (YouTube does not always offer one). Null: off. */
  covers: { fixTrack(id: string, signal: AbortSignal): Promise<string | null> } | null;
  /** Downloads a song from YouTube Music. */
  youtube: AudioSource;
  fetchPlaylist(id: string): Promise<Playlist>;
  fetchAlbum(id: string): Promise<Album>;
  uploadsDir: string;
  /** Reserves a free path for `name` in the uploads folder; `release` frees the reservation. */
  claim(name: string): string;
  release(path: string): void;
  sanitize(name: string): string;
};

const isActive = (job: ImportJob) => job.status === "queued" || job.status === "running";

/** Works through playlists, albums and single songs one track at a time. Jobs live in memory: a server restart forgets them. */
export class Importer {
  private jobs: ImportJob[] = [];
  private current: { job: ImportJob; abort: AbortController } | null = null;
  private pumping = false;
  private readonly starting = new Map<string, Promise<ImportJob>>();

  constructor(private readonly deps: ImporterDeps) {}

  list(): ImportJob[] {
    return this.jobs;
  }

  startPlaylist(playlistId: string): Promise<ImportJob> {
    return this.start("playlist", playlistId, async () => {
      const playlist = await this.deps.fetchPlaylist(playlistId);
      if (playlist.tracks.length === 0) throw new NothingFoundError("playlist not found, empty or private");
      return playlist;
    });
  }

  startAlbum(albumId: string): Promise<ImportJob> {
    return this.start("album", albumId, async () => {
      const album = await this.deps.fetchAlbum(albumId);
      if (album.tracks.length === 0) throw new NothingFoundError("album not found or empty");
      return { title: `${album.artists.join(", ")} – ${album.title}`, tracks: album.tracks };
    });
  }

  startSong(track: PlaylistTrack): Promise<ImportJob> {
    return this.start("song", track.videoId, async () => ({ title: `${track.artists.join(", ")} – ${track.title}`, tracks: [track] }));
  }

  /** Repeating a request that is still importing returns its job. */
  private start(kind: ImportJob["kind"], source: string, load: () => Promise<Playlist>): Promise<ImportJob> {
    const running = this.jobs.find((j) => j.kind === kind && j.source === source && isActive(j));
    if (running) return Promise.resolve(running);
    const key = `${kind}:${source}`;
    const pending = this.starting.get(key) ?? this.create(kind, source, load).finally(() => this.starting.delete(key));
    this.starting.set(key, pending);
    return pending;
  }

  private async create(kind: ImportJob["kind"], source: string, load: () => Promise<Playlist>): Promise<ImportJob> {
    const playlist = await load();
    const job: ImportJob = {
      id: randomUUID().replaceAll("-", "").slice(0, 16),
      kind,
      source,
      title: playlist.title,
      status: "queued",
      createdAt: new Date().toISOString(),
      tracks: playlist.tracks.map((t) => ({ ...t, status: "pending", error: null, trackId: null })),
    };
    this.jobs.unshift(job);
    const finished = this.jobs.filter((j) => !isActive(j));
    for (const old of finished.slice(MAX_KEPT_JOBS)) this.jobs.splice(this.jobs.indexOf(old), 1);
    void this.pump();
    return job;
  }

  /** Stops an active job, or forgets a finished one. False when there is no such job. */
  discard(id: string): boolean {
    const job = this.jobs.find((j) => j.id === id);
    if (!job) return false;
    if (this.current?.job === job) this.current.abort.abort();
    else if (job.status === "queued") job.status = "cancelled";
    else this.jobs.splice(this.jobs.indexOf(job), 1);
    return true;
  }

  /** Resolves once the worker has drained the queue. */
  async idle(): Promise<void> {
    while (this.pumping) await Bun.sleep(5);
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      await this.removeStaleTempFiles();
      for (;;) {
        const job = this.jobs.findLast((j) => j.status === "queued");
        if (!job) return;
        await this.run(job);
      }
    } finally {
      this.pumping = false;
    }
  }

  /** Partial downloads left behind if the server stopped mid-import. */
  private async removeStaleTempFiles(): Promise<void> {
    const names = await readdir(this.deps.uploadsDir).catch(() => []);
    await Promise.all(
      names.filter((n) => n.startsWith(TMP_PREFIX)).map((n) => rm(join(this.deps.uploadsDir, n), { force: true })),
    );
  }

  private async run(job: ImportJob): Promise<void> {
    const abort = new AbortController();
    this.current = { job, abort };
    job.status = "running";
    for (const track of job.tracks) {
      if (abort.signal.aborted) break;
      await this.importTrack(track, abort.signal);
    }
    job.status = abort.signal.aborted ? "cancelled" : "done";
    this.current = null;
  }

  private async importTrack(track: ImportTrack, signal: AbortSignal): Promise<void> {
    try {
      const existing = this.findInLibrary(track);
      if (existing) {
        Object.assign(track, { status: "exists", trackId: existing.id });
        return;
      }
      track.status = "downloading";
      await this.store(".m4a", track, signal, (tmp) => this.deps.youtube.download(track, tmp, signal));
    } catch (err) {
      if (signal.aborted) Object.assign(track, { status: "pending", error: null });
      else Object.assign(track, { status: "failed", error: (err as Error).message });
    }
  }

  private findInLibrary(track: PlaylistTrack): Track | null {
    const query = `${track.artists[0] ?? ""} ${cleanTitle(track)}`;
    // Titles lose their brackets when compared, so a radio edit and a dub of a song only differ by length.
    const sameLength = (t: Track) => track.durationMs === null || Math.abs(t.durationMs - track.durationMs) <= DURATION_TOLERANCE_MS;
    return this.deps.lib.search(query, 20).tracks.find((t) => isSameSong(track, t.title, t.artist) && sameLength(t)) ?? null;
  }

  /** Fetches the audio into a temp file, checks it is the right song and adds it to the library. */
  private async store(ext: string, track: ImportTrack, signal: AbortSignal, fetchTo: (tmp: string) => Promise<void>): Promise<void> {
    const { uploadsDir, scanner, sanitize, claim, release } = this.deps;
    await mkdir(uploadsDir, { recursive: true });
    const tmp = join(uploadsDir, `${TMP_PREFIX}${randomUUID()}${ext}`);
    let final: string | null = null;
    try {
      await fetchTo(tmp);
      await this.assertLength(tmp, track);
      final = claim(sanitize(`${track.artists.join(", ")} - ${cleanTitle(track)}${ext}`));
      const [saved] = await scanner.indexUploads([{ tmp, final }]);
      Object.assign(track, { status: "done", error: null, trackId: saved!.id });
      if (!saved!.hasArtwork) await this.deps.covers?.fixTrack(saved!.id, signal);
    } finally {
      await rm(tmp, { force: true });
      if (final) release(final);
    }
  }

  /** A video can differ from what the catalog lists for it, such as a much longer or cut-off upload. */
  private async assertLength(path: string, track: PlaylistTrack): Promise<void> {
    if (track.durationMs === null) return;
    const { format } = await parseFile(path, { duration: true });
    const actualMs = (format.duration ?? 0) * 1000;
    if (Math.abs(actualMs - track.durationMs) > DURATION_TOLERANCE_MS) throw new Error("the download has a different length from this song");
  }
}
