# blednify-server

Self-hosted music library for the Blednify app. Bun + Hono + SQLite (WAL, FTS5). It indexes a folder of audio
files and serves the JSON API and audio streams described in [`docs/API.md`](../../docs/API.md).

## Run

```sh
cd apps/server
bun install
MUSIC_DIR=~/Music ADMIN_TOKEN=change-me bun start      # http://0.0.0.0:8787
bun run dev                                            # same, with --watch
bun run scan                                           # one-off index of MUSIC_DIR, prints {added,removed,total}
bun run typecheck && bun test
```

The server answers immediately on startup and indexes `MUSIC_DIR` in the background. Later scans are
incremental: files whose size and mtime are unchanged are skipped and rows for deleted files are removed.
Trigger one with `POST /api/rescan` or `bun run scan` (safe while the server is running).

Supported files: `mp3 flac m4a aac ogg opus wav` (case-insensitive). Dot-files and dot-directories are skipped,
symlinks are followed. A file that fails to parse is logged and skipped until its size or mtime changes.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | HTTP port |
| `MUSIC_DIR` | `./music` | Library root (scanned recursively). Uploads go to `MUSIC_DIR/uploads/`. |
| `DATA_DIR` | `./data` | `blednify.db` (SQLite index) and `art/` (artwork cache). Safe to delete; it is rebuilt by a scan. |
| `ADMIN_TOKEN` | unset | When set, `POST /api/tracks`, `DELETE /api/tracks/:id` and `POST /api/rescan` need `Authorization: Bearer <token>`. When unset, writes are open, so set it on anything reachable from outside your LAN. Reads are always public. |
| `MAX_UPLOAD_MB` | `200` | Max size of one upload request. Larger requests get `413 {"error": ...}`. |
| `PUBLIC` | unset | Reserved. Has no effect yet. |
| `LOG_REQUESTS` | `1` | `0` turns off the one-line-per-request log. Successful `/api/health` calls are never logged. |

## Behaviour notes

- **IDs** follow `docs/API.md`: the track id is `sha1(path relative to MUSIC_DIR, "/"-separated)` (first 16 hex
  characters), and the artist id is `sha1(artist)`. For the album id, the `artist` in
  `sha1(artist + "\0" + album)` is the **album artist**: the `albumartist` tag, or the track artist when that
  tag is missing. This keeps compilations ("Various Artists") together as one album. Artists are the union of
  track artists and album artists. `/api/artists/:id` lists every album the artist appears on and every track
  where they are the track artist or the album artist.
- **Fallbacks**: if there is no title tag, the title comes from the filename. `01 - Artist - Title.mp3` gives
  track 1, artist `Artist` and title `Title`. Otherwise the fallbacks are `Unknown Artist` and `Unknown Album`.
- **Search** uses SQLite FTS5 (`unicode61 remove_diacritics 2`). Every word is a prefix match, all words must
  match, and results are ordered by relevance. For example, `beyonce hal` finds "Beyoncé – Halo". If FTS5 is
  unavailable, search falls back to `LIKE`, which is not diacritics-insensitive. `/api/tracks?q=` uses relevance
  order unless `sort` is given.
- **Streaming** covers `Range` (single range, `206`), unsatisfiable ranges (`416` with `Content-Range: bytes */size`),
  `If-Range`, `If-None-Match` (`304`) and `HEAD`. Responses are sent zero-copy via `Bun.file` and are never
  compressed. Cache policy is `public, max-age=31536000, immutable`, as the contract requires.
- **Artwork**: the embedded cover is extracted on first request and cached as `DATA_DIR/art/<id>.jpg|png`.
  Later requests are a plain file send. `?size=N` is supported: it is rounded up to 64/128/256/512/1024, resized
  with the built-in `Bun.Image` (aspect kept, no upscaling), encoded as JPEG and cached as `<id>-<bucket>.jpg`.
  Sizes above 1024, or covers already smaller than the bucket, return the original. If resizing fails, the
  original is served. Covers that are neither JPEG nor PNG are converted to JPEG. Cache policy is
  `public, max-age=2592000` plus an ETag.
- **Uploads**: multipart field `file`, repeatable. Filenames are sanitized (no path parts or control/reserved
  characters) and made unique with a ` (n)` suffix. Each file is parsed before it is accepted; an unreadable or
  corrupt file returns `422`, and nothing from that request is kept. Unsupported extensions return `415`.
  Success returns `201 {"items": Track[]}`, already indexed.
- **Errors** are always JSON: `{ "error": "..." }`. JSON responses are gzip/deflate-compressed when the client
  accepts it. CORS allows all origins.

## Docker

```sh
cd apps/server
docker build -t blednify-server .
docker run -d --name blednify -p 8787:8787 \
  -e ADMIN_TOKEN=change-me \
  -v /path/to/music:/music -v blednify-data:/data \
  blednify-server
```

Or use `docker compose up -d` with the bundled [`docker-compose.yml`](./docker-compose.yml). CI publishes
`ghcr.io/<owner>/blednify-server:latest` from `main`. The image runs as the non-root `bun` user (uid 1000). It
declares `VOLUME /music /data` and exposes port 8787. Its `HEALTHCHECK` polls `/api/health`. For uploads and
deletes to work, the music volume must be writable by uid 1000.

## Point the app at it

- **On the phone**: Settings → Server → enter `http://<server-ip>:8787` → Test. It should report the track count.
- **At build time**: set `EXPO_PUBLIC_API_URL=http://<server-ip>:8787` (CI uses the `BLEDNIFY_API_URL` repo
  variable). That becomes the default server URL.
- The phone must reach the server. Use the server's LAN IP, not `localhost`. On the Android emulator, use
  `http://10.0.2.2:8787`.
- Plain `http://` to a LAN address needs cleartext traffic allowed in the app build. For use outside your LAN,
  put the server behind HTTPS (for example Caddy or Tailscale) and set `ADMIN_TOKEN`.
