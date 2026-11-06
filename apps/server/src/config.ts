import { resolve } from "node:path";

export type Config = {
  port: number;
  musicDir: string;
  dataDir: string;
  /** When set, upload/delete/rescan require `Authorization: Bearer <adminToken>`. */
  adminToken: string | null;
  /** Without an admin token, writes are refused (403) unless this is set (`ALLOW_OPEN_WRITES=1`). */
  allowOpenWrites: boolean;
  maxUploadBytes: number;
  /** Folder with the exported web app, served at `/` next to the API. Null: API only. */
  webDir: string | null;
  /** Path of yt-dlp for downloading straight from YouTube Music. Null: not installed (or `YTDLP_PATH=off`). */
  ytdlpPath: string | null;
  /** Torrent import needs all three of these. */
  jackettUrl: string | null;
  jackettApiKey: string | null;
  jackettIndexersLatin: string[];
  jackettIndexersCyrillic: string[];
  torrServerUrl: string | null;
  /** Reserved; currently has no effect (reads are always public). */
  public: boolean;
  logRequests: boolean;
};

function int(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer, got "${value}"`);
  return n;
}

const list = (raw: string | undefined): string[] => (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function ytdlp(value: string | undefined): string | null {
  const wanted = value?.trim();
  if (wanted === "off") return null;
  return Bun.which(wanted || "yt-dlp");
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    port: int("PORT", env.PORT, 8787),
    musicDir: resolve(env.MUSIC_DIR || "./music"),
    dataDir: resolve(env.DATA_DIR || "./data"),
    adminToken: env.ADMIN_TOKEN?.trim() || null,
    allowOpenWrites: /^(1|true|yes)$/i.test(env.ALLOW_OPEN_WRITES ?? ""),
    maxUploadBytes: int("MAX_UPLOAD_MB", env.MAX_UPLOAD_MB, 200) * 1024 * 1024,
    webDir: env.WEB_DIR?.trim() ? resolve(env.WEB_DIR.trim()) : null,
    ytdlpPath: ytdlp(env.YTDLP_PATH),
    jackettUrl: env.JACKETT_URL?.trim().replace(/\/+$/, "") || null,
    jackettApiKey: env.JACKETT_API_KEY?.trim() || null,
    jackettIndexersLatin: list(env.JACKETT_INDEXERS_LATIN),
    jackettIndexersCyrillic: list(env.JACKETT_INDEXERS_CYRILLIC),
    torrServerUrl: env.TORRSERVER_URL?.trim().replace(/\/+$/, "") || null,
    public: /^(1|true|yes)$/i.test(env.PUBLIC ?? ""),
    logRequests: env.NODE_ENV !== "test" && env.LOG_REQUESTS !== "0",
  };
}
