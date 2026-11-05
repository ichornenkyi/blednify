import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { parseFile } from "music-metadata";
import type { Jackett } from "./jackett";
import type { Library, Track } from "./library";
import type { Scanner } from "./scanner";
import { cleanTitle, isSameSong, pickFile, rankReleases, type Release } from "./torrent-match";
import type { TorrServer } from "./torrserver";
import type { Album, Playlist, PlaylistTrack } from "./ytmusic";

export type ImportTrackStatus = "pending" | "searching" | "downloading" | "done" | "exists" | "failed";
export type ImportTrack = PlaylistTrack & { status: ImportTrackStatus; error: string | null; trackId: string | null };
export type ImportJob = {
  id: string;
  kind: "playlist" | "album" | "song";
  /** The YouTube Music id of the playlist, album or song. */
  source: string;
  /** The Jackett indexer picked for this job. Null: chosen per track by its script. */
  indexer: string | null;
  title: string;
  status: "queued" | "running" | "done" | "cancelled";
  createdAt: string;
  tracks: ImportTrack[];
};

export class NothingFoundError extends Error {}

const MAX_ATTEMPTS_PER_TRACK = 5;
const MAX_KEPT_JOBS = 20;
const DURATION_TOLERANCE_MS = 15_000;
const TMP_PREFIX = ".import-";

export type ImporterDeps = {
  lib: Library;
  scanner: Scanner;
  jackett: Jackett;
  /** Jackett indexer ids by the script of a track's name. Empty means every indexer. */
  indexers: { latin: string[]; cyrillic: string[] };
  torrServer: TorrServer;
  fetchPlaylist(id: string): Promise<Playlist>;
  fetchAlbum(id: string): Promise<Album>;
  uploadsDir: string;
  maxFileBytes: number;
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

  /** The indexers set up in Jackett. */
  indexers(signal: AbortSignal): Promise<{ id: string; name: string }[]> {
    return this.deps.jackett.indexers(signal);
  }

  startPlaylist(playlistId: string, indexer: string | null = null): Promise<ImportJob> {
    return this.start("playlist", playlistId, indexer, async () => {
      const playlist = await this.deps.fetchPlaylist(playlistId);
      if (playlist.tracks.length === 0) throw new NothingFoundError("playlist not found, empty or private");
      return playlist;
    });
  }

  startAlbum(albumId: string, indexer: string | null = null): Promise<ImportJob> {
    return this.start("album", albumId, indexer, async () => {
      const album = await this.deps.fetchAlbum(albumId);
      if (album.tracks.length === 0) throw new NothingFoundError("album not found or empty");
      return { title: `${album.artists.join(", ")} – ${album.title}`, tracks: album.tracks };
    });
  }

  startSong(track: PlaylistTrack, indexer: string | null = null): Promise<ImportJob> {
    return this.start("song", track.videoId, indexer, async () => ({ title: `${track.artists.join(", ")} – ${track.title}`, tracks: [track] }));
  }

  /** Repeating a request that is still importing returns its job. */
  private start(kind: ImportJob["kind"], source: string, indexer: string | null, load: () => Promise<Playlist>): Promise<ImportJob> {
    const running = this.jobs.find((j) => j.kind === kind && j.source === source && j.indexer === indexer && isActive(j));
    if (running) return Promise.resolve(running);
    const key = `${kind}:${indexer ?? ""}:${source}`;
    const pending = this.starting.get(key) ?? this.create(kind, source, indexer, load).finally(() => this.starting.delete(key));
    this.starting.set(key, pending);
    return pending;
  }

  private async create(kind: ImportJob["kind"], source: string, indexer: string | null, load: () => Promise<Playlist>): Promise<ImportJob> {
    const playlist = await load();
    const job: ImportJob = {
      id: randomUUID().replaceAll("-", "").slice(0, 16),
      kind,
      source,
      indexer,
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
      await this.importTrack(track, job, abort.signal);
    }
    job.status = abort.signal.aborted ? "cancelled" : "done";
    this.current = null;
  }

  private async importTrack(track: ImportTrack, job: ImportJob, signal: AbortSignal): Promise<void> {
    try {
      const existing = this.findInLibrary(track);
      if (existing) {
        Object.assign(track, { status: "exists", trackId: existing.id });
        return;
      }
      track.status = "searching";
      const failure = await this.searchAndDownload(track, job, signal);
      if (failure) Object.assign(track, { status: "failed", error: failure });
    } catch (err) {
      if (signal.aborted) Object.assign(track, { status: "pending", error: null });
      else Object.assign(track, { status: "failed", error: (err as Error).message });
    }
  }

  private findInLibrary(track: PlaylistTrack): Track | null {
    const query = `${track.artists[0] ?? ""} ${cleanTitle(track)}`;
    return this.deps.lib.search(query, 20).tracks.find((t) => isSameSong(track, t.title, t.artist)) ?? null;
  }

  /** Tries the song's own release, then its album, then the artist's collections; albums search for the whole album first. Returns why it failed, if it did. */
  private async searchAndDownload(track: ImportTrack, job: ImportJob, signal: AbortSignal): Promise<string | null> {
    const artist = track.artists[0];
    if (!artist) return "the playlist does not name an artist";
    const song = `${artist} ${cleanTitle(track)}`;
    const album = track.album && `${artist} ${track.album}`;
    const queries = (job.kind === "album" ? [album, song, artist] : [song, album, artist]).filter((q) => !!q) as string[];
    const routed = /\p{Script=Cyrillic}/u.test(`${track.artists.join(" ")} ${track.title}`) ? this.deps.indexers.cyrillic : this.deps.indexers.latin;
    const indexers = job.indexer ? [job.indexer] : routed;
    const tried = new Set<string>();
    let failure = "no matching torrent found";
    for (const query of queries) {
      let releases: Release[];
      try {
        releases = await this.deps.jackett.search(query, signal, indexers);
      } catch (err) {
        signal.throwIfAborted();
        failure = (err as Error).message;
        continue;
      }
      for (const release of rankReleases(releases, track)) {
        if (tried.has(release.link)) continue;
        if (tried.size >= MAX_ATTEMPTS_PER_TRACK) return failure;
        tried.add(release.link);
        try {
          if (await this.downloadFrom(release, track, signal)) return null;
        } catch (err) {
          signal.throwIfAborted();
          failure = (err as Error).message;
        }
        track.status = "searching";
      }
    }
    return failure;
  }

  /** True when the track was saved; false when this torrent does not have it. */
  private async downloadFrom(release: Release, track: ImportTrack, signal: AbortSignal): Promise<boolean> {
    const { torrServer } = this.deps;
    const { hash, owned } = await torrServer.add(release.link, signal);
    try {
      const files = await torrServer.files(hash, signal);
      if (!files) throw new Error("the torrent has no reachable peers");
      const file = pickFile(files, track, this.deps.maxFileBytes);
      if (!file) return false;
      track.status = "downloading";
      await this.saveFile(hash, file, track, signal);
      return true;
    } finally {
      if (owned) await torrServer.remove(hash).catch(() => undefined);
    }
  }

  private async saveFile(hash: string, file: { id: number; path: string; length: number }, track: ImportTrack, signal: AbortSignal): Promise<void> {
    const { uploadsDir, torrServer, scanner, sanitize, claim, release } = this.deps;
    await mkdir(uploadsDir, { recursive: true });
    const ext = extname(file.path).toLowerCase();
    const tmp = join(uploadsDir, `${TMP_PREFIX}${randomUUID()}${ext}`);
    let final: string | null = null;
    try {
      await torrServer.download(hash, file, tmp, signal);
      await this.assertLength(tmp, track);
      final = claim(sanitize(`${track.artists.join(", ")} - ${cleanTitle(track)}${ext}`));
      const [saved] = await scanner.indexUploads([{ tmp, final }]);
      Object.assign(track, { status: "done", error: null, trackId: saved!.id });
    } finally {
      await rm(tmp, { force: true });
      if (final) release(final);
    }
  }

  /** The filename can match while the audio is something else, such as a whole album or a different recording. */
  private async assertLength(path: string, track: PlaylistTrack): Promise<void> {
    if (track.durationMs === null) return;
    const { format } = await parseFile(path, { duration: true });
    const actualMs = (format.duration ?? 0) * 1000;
    if (Math.abs(actualMs - track.durationMs) > DURATION_TOLERANCE_MS) throw new Error("the matching file has a different length");
  }
}
