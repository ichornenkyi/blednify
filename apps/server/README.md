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

Scans never wipe the library because a volume is missing. An unreadable `MUSIC_DIR` fails the scan, tracks under
an unreadable subfolder are kept, and a background scan that finds no files at all while tracks are indexed
removes nothing (it logs a warning). Only an explicit `POST /api/rescan` reconciles an intentionally emptied folder.

Supported files: `mp3 flac m4a aac ogg opus wav` (case-insensitive). Dot-files and dot-directories are skipped,
symlinks are followed. A file that fails to parse is logged and skipped until its size or mtime changes.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | HTTP port |
| `MUSIC_DIR` | `./music` | Library root (scanned recursively). Uploads go to `MUSIC_DIR/uploads/`. |
| `DATA_DIR` | `./data` | `blednify.db` (SQLite index) and `art/` (artwork cache). Safe to delete; it is rebuilt by a scan. |
| `ADMIN_TOKEN` | unset | When set, `POST /api/tracks`, `DELETE /api/tracks/:id` and `POST /api/rescan` need `Authorization: Bearer <token>`. When unset, those writes return `403`. Reads are always public. |
| `ALLOW_OPEN_WRITES` | unset | `1` allows writes without a token when `ADMIN_TOKEN` is unset. Only for a trusted LAN. |
| `MAX_UPLOAD_MB` | `200` | Max size of one upload request. Larger requests get `413 {"error": ...}`. |
| `WEB_DIR` | unset (`/app/web` in Docker) | Folder with the exported web app, served at `/` next to the API. Unset: API only. |
| `YTDLP_PATH` | `yt-dlp` on `PATH` | yt-dlp for downloading songs straight from YouTube Music (needs ffmpeg). The Docker image has both. `off` disables it. |
| `JACKETT_URL` | unset | Jackett address, for music import. |
| `JACKETT_API_KEY` | unset | Jackett API key (top right of its dashboard). |
| `JACKETT_INDEXERS_LATIN` | unset | Comma-separated Jackett indexer ids for songs named only in Latin letters, e.g. `thepiratebay`. Unset means all indexers. |
| `JACKETT_INDEXERS_CYRILLIC` | unset | Same, for songs with Cyrillic in the artist or title, e.g. `rutor,toloka`. |
| `TORRSERVER_URL` | unset | TorrServer address, for music import. Torrent import needs all three of these; YouTube Music import only needs yt-dlp. Import is off when neither is available. |
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
  `public, no-cache` plus an ETag, so a changed cover shows up on the next load.
- **Uploads**: multipart field `file`, repeatable. Filenames are sanitized (no path parts or control/reserved
  characters, at most 200 UTF-8 bytes) and made unique with a ` (n)` suffix. A name whose track id was used
  before (a deleted track) is never reused, since clients cache streams and downloads by id. Files are written
  under hidden temp names and moved into place only after every file in the request parsed; an unreadable or
  corrupt file returns `422`, and nothing from that request is kept. Unsupported extensions return `415`.
  Storage failures return `507` (disk full) or `500` with the errno (for example a read-only or wrongly owned
  `MUSIC_DIR`). Success returns `201 {"items": Track[]}`, already indexed.
- **Music import** (`POST /api/imports`): takes a public or unlisted YouTube Music playlist link, an album or a
  song. `POST /api/imports/search` finds albums and songs on YouTube Music to pick from, so each search has an exact
  title and artist. Tracks are handled one at a time. A song already in the library is skipped. With the **YouTube Music** provider
  (needs yt-dlp), the song's own video is downloaded as AAC (`.m4a`, copied without re-encoding when YouTube offers it, converted
  from Opus otherwise) and tagged with the playlist's title, artist and album; the same length check applies. With no provider
  picked, trackers are tried first and YouTube Music is the fallback when none has the song; a picked tracker is never
  overridden. Without Jackett and TorrServer, YouTube Music is the only provider. Otherwise Jackett is searched for the song, then
  its album, then the artist (for an album: the album first), in the Audio and Other categories (RuTor files everything under Other). A tracker picked in the app replaces those two settings for that job. Releases must be seeded and name the artist. Up to 5 are opened
  in TorrServer until one has an audio file named after the song, and only that file's pieces are fetched. TorrServer
  only streams and caches, so Blednify saves the stream to `MUSIC_DIR/uploads/`, where it is validated like an upload.
  The stream can carry pieces that have not passed their hash check yet, so each file is read until two reads match.
  A file more than 15 seconds off the playlist's length, or larger than `MAX_UPLOAD_MB`, is rejected. Torrents the
  import added are removed from TorrServer afterwards; ones already there are left alone. Songs with no match are
  reported as failed, with the reason. Jobs are held in memory, so a restart forgets them; run the playlist again
  and finished songs are skipped. Private playlists and auto-generated mixes cannot be read.
- **Covers** (`POST /api/library/covers`): torrent files often have no cover, and album and artist covers come from a track's own, so
  they stay blank too. This looks each cover-less song up on YouTube Music (the title, artist and length must match; live and remix
  versions are refused) and rewrites the file with the cover embedded and the audio copied unchanged. The new file replaces the
  original only when its tags and length match. `.wav` and `.ogg` files cannot be changed. New imports run this for songs that arrive without one.
- **Errors** are always JSON: `{ "error": "..." }`. JSON responses are gzip/deflate-compressed when the client
  accepts it. CORS allows all origins.

## Docker

```sh
# from the repository root: the image also bundles the web app
docker build -f apps/server/Dockerfile -t blednify-server .
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
