import { resolve } from "node:path";

export type Config = {
  port: number;
  musicDir: string;
  dataDir: string;
  /** When set, upload/delete/rescan require `Authorization: Bearer <adminToken>`. */
  adminToken: string | null;
  maxUploadBytes: number;
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

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    port: int("PORT", env.PORT, 8787),
    musicDir: resolve(env.MUSIC_DIR || "./music"),
    dataDir: resolve(env.DATA_DIR || "./data"),
    adminToken: env.ADMIN_TOKEN?.trim() || null,
    maxUploadBytes: int("MAX_UPLOAD_MB", env.MAX_UPLOAD_MB, 200) * 1024 * 1024,
    public: /^(1|true|yes)$/i.test(env.PUBLIC ?? ""),
    logRequests: env.NODE_ENV !== "test" && env.LOG_REQUESTS !== "0",
  };
}
