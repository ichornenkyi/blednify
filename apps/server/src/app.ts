import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import pkg from "../package.json";
import { ArtworkCache } from "./artwork";
import { PathClaimer, sanitizeFileName } from "./claim";
import type { Config } from "./config";
import { openDb, type Db } from "./db";
import { audioMime } from "./ids";
import { Importer, LinkError } from "./imports/importer";
import { Library, toTrack } from "./library";
import { LyricsService } from "./lyrics";
import { InvalidAudioError, Scanner } from "./scanner";
import { serveFile } from "./serve-file";

export { sanitizeFileName } from "./claim";

export const VERSION: string = pkg.version;

export type AppContext = {
  config: Config;
  db: Db;
  lib: Library;
  scanner: Scanner;
  art: ArtworkCache;
  lyrics: LyricsService;
  claims: PathClaimer;
  importer: Importer;
};

export function createContext(config: Config): AppContext {
  const db = openDb(config.dataDir);
  const lib = new Library(db);
  const art = new ArtworkCache(join(config.dataDir, "art"));
  const scanner = new Scanner(config.musicDir, lib, art);
  const lyrics = new LyricsService(db, { online: config.lyricsOnline, lrclibUrl: config.lrclibUrl });
  const claims = new PathClaimer(config.musicDir, lib);
  const importer = new Importer({ config, db, lib, scanner, claims });
  return { config, db, lib, scanner, art, lyrics, claims, importer };
}

const IMMUTABLE = "public, max-age=31536000, immutable";
const ART_CACHE = "public, max-age=2592000";
// With a listen token, responses are per-user content: keep them out of shared caches (e.g. Cloudflare's).
const IMMUTABLE_PRIVATE = "private, max-age=31536000, immutable";
const ART_CACHE_PRIVATE = "private, max-age=2592000";
const ID_RE = /^[0-9a-f]{16}$/;

const fail = (status: 400 | 401 | 403 | 404 | 413 | 415 | 422, error: string): never => {
  throw new HTTPException(status, { message: error });
};

const qString = z.string().trim().max(200).optional();
const limitParam = (def: number, max: number) =>
  z.coerce.number().int().min(1).default(def).transform((n) => Math.min(n, max));
const offsetParam = z.coerce.number().int().min(0).default(0);

const tracksQuery = z.object({
  q: qString,
  limit: limitParam(50, 500),
  offset: offsetParam,
  sort: z.enum(["added", "title", "artist"]).optional(),
});
const pageQuery = z.object({ q: qString, limit: limitParam(50, 500), offset: offsetParam });
const searchQuery = z.object({ q: z.string().max(200).default(""), limit: limitParam(20, 100) });
const goneQuery = z.object({
  ids: z
    .string()
    .default("")
    .transform((v) => v.split(",").filter((id) => ID_RE.test(id)))
    .refine((ids) => ids.length <= 500, "at most 500 ids"),
});
const artQuery = z.object({ size: z.coerce.number().int().min(16).max(4096).optional() });

/** Validates query params (empty values count as absent); 400 with the first issue on failure. */
function query<S extends z.ZodType>(c: Context, schema: S): z.output<S> {
  const raw = Object.fromEntries(Object.entries(c.req.query()).filter(([, v]) => v !== ""));
  const r = schema.safeParse(raw);
  if (!r.success) {
    const issue = r.error.issues[0];
    fail(400, `invalid query parameter ${issue?.path.join(".") || ""}: ${issue?.message ?? "invalid"}`.trim());
  }
  return r.data as z.output<S>;
}

function param(c: Context): string {
  const id = c.req.param("id") ?? "";
  if (!ID_RE.test(id)) fail(404, "not found");
  return id;
}

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Bearer-token guard for writes. Fails closed: with no token configured, writes need `ALLOW_OPEN_WRITES=1`. */
function adminOnly(token: string | null, allowOpen: boolean): MiddlewareHandler {
  const expected = token ? digest(token) : null;
  return async (c, next) => {
    if (expected) {
      const m = /^Bearer\s+(.+)$/i.exec(c.req.header("authorization") ?? "");
      if (!m || !timingSafeEqual(digest(m[1]!.trim()), expected)) {
        c.header("WWW-Authenticate", 'Bearer realm="blednify"');
        fail(401, "unauthorized");
      }
    } else if (!allowOpen) {
      fail(403, "writes are disabled: set ADMIN_TOKEN on the server (or ALLOW_OPEN_WRITES=1 on a trusted LAN)");
    }
    await next();
  };
}

/** True when the request carries the bearer token (constant-time compare). */
function bearerMatches(c: Context, expected: Buffer): boolean {
  const m = /^Bearer\s+(.+)$/i.exec(c.req.header("authorization") ?? "");
  return !!m && timingSafeEqual(digest(m[1]!.trim()), expected);
}

/** Keeps the connection open for long-running admin requests (Bun's default idle timeout is 10s). */
function noIdleTimeout(c: Context): void {
  const server = c.env as { timeout?: (req: Request, seconds: number) => void } | undefined;
  server?.timeout?.(c.req.raw, 0);
}

/** Maps filesystem failures during an upload to an honest status (never "bad audio file"). */
function storageError(err: unknown): { status: 500 | 507; error: string } | null {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  if (!code) return null;
  if (code === "ENOSPC" || code === "EDQUOT") return { status: 507, error: `server storage is full (${code})` };
  if (code === "EACCES" || code === "EPERM" || code === "EROFS")
    return { status: 500, error: `server cannot write to its music folder (${code}); check MUSIC_DIR permissions` };
  return { status: 500, error: `server could not store the upload (${code})` };
}

export function createApp(ctx: AppContext): Hono {
  const { config, lib, scanner, art, lyrics, claims, importer } = ctx;
  const app = new Hono();
  const admin = adminOnly(config.adminToken, config.allowOpenWrites);
  const uploadsDir = join(config.musicDir, "uploads");

  if (config.logRequests) {
    app.use(async (c, next) => {
      const t = performance.now();
      await next();
      if (c.req.path === "/api/health" && c.res.status < 400) return;
      console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${Math.round(performance.now() - t)}ms`);
    });
  }
  app.use(
    cors({
      origin: "*",
      allowMethods: ["GET", "HEAD", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["Authorization", "Content-Type", "Range", "If-None-Match", "If-Range"],
      exposeHeaders: ["Content-Length", "Content-Range", "Accept-Ranges", "ETag"],
      maxAge: 86400,
    }),
  );
  app.use(compress({ contentTypeFilter: /^application\/json/ }));

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message || "error" }, err.status);
    console.error(`[error] ${c.req.method} ${c.req.path}:`, err);
    return c.json({ error: "internal server error" }, 500);
  });
  app.notFound((c) => c.json({ error: "not found" }, 404));

  // Health is the only endpoint that answers without the listen token: it tells the app whether a token is
  // needed, and only reveals the track count to a caller that presents a valid token.
  const listenDigest = config.listenToken ? digest(config.listenToken) : null;
  const immutableCache = listenDigest ? IMMUTABLE_PRIVATE : IMMUTABLE;
  const artCache = listenDigest ? ART_CACHE_PRIVATE : ART_CACHE;

  app.get("/api/health", (c) => {
    const base = { ok: true, name: "blednify", version: VERSION };
    if (!listenDigest) return c.json({ ...base, authRequired: false, trackCount: lib.trackCount() });
    const hasBearer = /^Bearer\s+/i.test(c.req.header("authorization") ?? "");
    if (hasBearer && !bearerMatches(c, listenDigest)) {
      c.header("WWW-Authenticate", 'Bearer realm="blednify"');
      fail(401, "wrong access token");
    }
    if (!bearerMatches(c, listenDigest)) return c.json({ ...base, authRequired: true });
    return c.json({ ...base, authRequired: true, trackCount: lib.trackCount() });
  });

  // Library reads require the listen token when one is configured. Writes are guarded by ADMIN_TOKEN
  // instead (one Authorization header can carry only one token), and they fail closed without it.
  if (listenDigest) {
    app.use("/api/*", async (c, next) => {
      if ((c.req.method === "GET" || c.req.method === "HEAD") && !bearerMatches(c, listenDigest)) {
        c.header("WWW-Authenticate", 'Bearer realm="blednify"');
        fail(401, "unauthorized");
      }
      await next();
    });
  }

  // ---------- tracks ----------

  app.get("/api/tracks", (c) => c.json(lib.listTracks(query(c, tracksQuery))));

  // Which of the given ids were deleted from this server, so the app can drop them from likes/playlists/recents.
  app.get("/api/tracks/gone", (c) => {
    const { ids } = query(c, goneQuery);
    return c.json({ gone: lib.goneIds([...new Set(ids)]) });
  });

  app.get("/api/tracks/:id", (c) => {
    const row = lib.trackRow(param(c));
    return row ? c.json(toTrack(row)) : fail(404, "track not found");
  });

  app.get("/api/tracks/:id/stream", async (c) => {
    const row = lib.trackRow(param(c)) ?? fail(404, "track not found");
    const res = await serveFile(c.req.raw, {
      path: join(config.musicDir, row.path),
      contentType: row.mime,
      cacheControl: immutableCache,
      etagKey: row.id,
    });
    return res ?? fail(404, "audio file missing");
  });

  app.get("/api/tracks/:id/artwork", async (c) => {
    const { size } = query(c, artQuery);
    const row = lib.trackRow(param(c)) ?? fail(404, "track not found");
    if (!row.has_art) fail(404, "no artwork");
    let file;
    try {
      file = await art.get(row.id, join(config.musicDir, row.path), size ?? null);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") fail(404, "audio file missing");
      throw err;
    }
    if (!file) return fail(404, "no artwork");
    const res = await serveFile(c.req.raw, {
      path: file.path,
      contentType: file.mime,
      cacheControl: artCache,
      etagKey: `${row.id}-${size ?? 0}`,
    });
    return res ?? fail(404, "no artwork");
  });

  app.get("/api/tracks/:id/lyrics", async (c) => {
    const row = lib.trackRow(param(c)) ?? fail(404, "track not found");
    c.header("Cache-Control", listenDigest ? "private, max-age=3600" : "public, max-age=3600");
    return c.json(await lyrics.get(row, join(config.musicDir, row.path)));
  });

  // Lets the app verify an admin token and learn the upload limit. POST, like every other admin route, so a
  // listen token (which travels in the same Authorization header) is never needed alongside it.
  app.post("/api/admin/check", admin, async (c) =>
    c.json({
      ok: true,
      maxUploadBytes: config.maxUploadBytes,
      formats: ["mp3", "flac", "m4a", "aac", "ogg", "opus", "wav"],
      imports: await importer.isAvailable(),
    }),
  );

  app.post(
    "/api/tracks",
    admin,
    bodyLimit({
      maxSize: config.maxUploadBytes,
      onError: () => fail(413, `upload exceeds ${Math.round(config.maxUploadBytes / 1048576)} MB`),
    }),
    async (c) => {
      noIdleTimeout(c);
      if (!c.req.header("content-type")?.toLowerCase().startsWith("multipart/form-data"))
        fail(415, "expected multipart/form-data");
      const form = (await c.req.raw.formData().catch(() => null)) ?? fail(400, "malformed multipart body");
      const files = form.getAll("file").flatMap((v) => (typeof v === "string" ? [] : [v]));
      if (files.length === 0) fail(400, "multipart field 'file' is required");
      const unsupported = files.filter((f) => !audioMime(f.name));
      if (unsupported.length)
        fail(415, `unsupported file type: ${unsupported.map((f) => f.name).join(", ")} (mp3, flac, m4a, aac, ogg, opus, wav)`);

      // Written under dot-names (scans skip them) and moved into place only once every file validated.
      const items: { tmp: string; final: string }[] = [];
      try {
        await mkdir(uploadsDir, { recursive: true });
        for (const f of files) {
          const final = claims.claim("uploads", sanitizeFileName(f.name));
          const tmp = join(uploadsDir, `.upload-${randomUUID()}${extname(final)}`);
          items.push({ tmp, final });
          await Bun.write(tmp, f);
        }
        return c.json({ items: await scanner.indexUploads(items) }, 201);
      } catch (err) {
        if (err instanceof HTTPException) throw err;
        if (err instanceof InvalidAudioError) return fail(422, `not a readable audio file: ${err.message}`);
        const storage = storageError(err);
        if (!storage) throw err;
        console.error(`[upload] ${storage.error}: ${(err as Error).message}`);
        return c.json({ error: storage.error }, storage.status);
      } finally {
        await Promise.all(items.map(({ tmp }) => rm(tmp, { force: true })));
        for (const { final } of items) claims.release(final);
      }
    },
  );

  app.delete("/api/tracks/:id", admin, async (c) => {
    const row = lib.trackRow(param(c)) ?? fail(404, "track not found");
    await rm(join(config.musicDir, row.path), { force: true });
    lib.deleteTracks([row.id]);
    lib.rebuildAggregates();
    await art.invalidate(row.id);
    lyrics.forget(row.id);
    return c.body(null, 204);
  });

  app.post("/api/rescan", admin, async (c) => {
    noIdleTimeout(c);
    return c.json(await scanner.scan(true));
  });

  // ---------- playlist imports ----------
  // Starting/cancelling needs the admin token; reading a job's progress is a normal (listen-token) read, so the
  // app can poll it and load its cover like any other image.

  const importBody = z.object({ url: z.string().trim().min(1).max(2000) });

  app.post("/api/imports", admin, async (c) => {
    const body = importBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) fail(400, "expected JSON { url }");
    if (!(await importer.isAvailable())) fail(422, "imports are unavailable: the server needs yt-dlp and ffmpeg");
    try {
      return c.json(await importer.start(body.data!.url), 202);
    } catch (err) {
      if (err instanceof LinkError) fail(422, err.message);
      throw err;
    }
  });
  app.get("/api/imports", (c) => c.json({ items: importer.list() }));
  app.get("/api/imports/:id", (c) => c.json(importer.get(param(c)) ?? fail(404, "import not found")));
  app.get("/api/imports/:id/cover", async (c) => {
    const path = importer.coverPath(param(c)) ?? fail(404, "no cover");
    const res = await serveFile(c.req.raw, { path, contentType: "image/jpeg", cacheControl: artCache, etagKey: `import-${c.req.param("id")}` });
    return res ?? fail(404, "no cover");
  });
  app.post("/api/imports/:id/cancel", admin, (c) => c.json(importer.cancel(param(c)) ?? fail(404, "import not found")));
  app.post("/api/imports/:id/retry", admin, (c) => c.json(importer.retry(param(c)) ?? fail(404, "import not found")));
  app.delete("/api/imports/:id", admin, async (c) => ((await importer.remove(param(c))) ? c.body(null, 204) : fail(404, "import not found")));

  // ---------- albums / artists / search ----------

  app.get("/api/albums", (c) => c.json(lib.listAlbums(query(c, pageQuery))));
  app.get("/api/albums/:id", (c) => c.json(lib.getAlbum(param(c)) ?? fail(404, "album not found")));
  app.get("/api/artists", (c) => c.json(lib.listArtists(query(c, pageQuery))));
  app.get("/api/artists/:id", (c) => c.json(lib.getArtist(param(c)) ?? fail(404, "artist not found")));
  app.get("/api/search", (c) => {
    const { q, limit } = query(c, searchQuery);
    return c.json(lib.search(q, limit));
  });

  return app;
}
