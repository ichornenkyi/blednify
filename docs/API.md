# Blednify API contract (v1)

Single source of truth between `apps/server` and `apps/mobile`. Change both sides together.

Base URL: configurable in the app (Settings → Server). Default from `EXPO_PUBLIC_API_URL`.
All JSON. Reads need `Authorization: Bearer <LISTEN_TOKEN>` (`/api/health` is always open and reports `authRequired`); a server without `LISTEN_TOKEN` refuses to start unless it runs with `ALLOW_OPEN_READS=1`, which leaves reads open. Writes (upload/delete/rescan/admin check, all `POST`/`DELETE`) require `Authorization: Bearer <ADMIN_TOKEN>` instead; a server without `ADMIN_TOKEN` refuses them with `403` unless it runs with `ALLOW_OPEN_WRITES=1`.

## Types

```ts
type Track = {
  id: string;            // stable: sha1 of relative file path, hex, first 16 chars; uploads never reuse a deleted id
  title: string;
  artist: string;        // "Unknown Artist" fallback
  album: string;         // "Unknown Album" fallback
  albumId: string;       // sha1(artist + "\u0000" + album), first 16 hex
  artistId: string;      // sha1(artist), first 16 hex
  durationMs: number;
  trackNumber: number | null;
  discNumber: number | null;
  year: number | null;
  genre: string | null;
  mimeType: string;      // e.g. audio/mpeg, audio/flac, audio/mp4, audio/ogg
  sizeBytes: number;
  bitrate: number | null; // kbps
  hasArtwork: boolean;
  addedAt: string;       // ISO 8601
};

type Album = { id: string; title: string; artist: string; artistId: string; year: number | null; trackCount: number; durationMs: number; artworkTrackId: string | null };
type Artist = { id: string; name: string; albumCount: number; trackCount: number; artworkTrackId: string | null };
type Page<T> = { items: T[]; total: number; limit: number; offset: number };
type ApiError = { error: string };
type LyricLine = { timeMs: number; text: string };   // text "" = instrumental break
type Lyrics = {
  synced: LyricLine[] | null;  // sorted by timeMs; null when only plain text is known
  plain: string | null;        // "\n"-separated
  instrumental: boolean;
  source: "file" | "embedded" | "lrclib" | null;   // null = no lyrics found
};
```

## Endpoints

| Method | Path | Result |
|---|---|---|
| GET | `/api/health` | `{ ok: true, name: "blednify", version: string, authRequired: boolean, trackCount?: number }` (count only with a valid token when required) |
| POST | `/api/session` | `204` + `Set-Cookie: blednify_listen=…; Path=/api; HttpOnly; SameSite=Strict` (`Secure` behind https). Needs `Authorization: Bearer <LISTEN_TOKEN>`; `401` otherwise. The web app uses it because `<audio>`/`<img>` cannot send headers: every read also accepts this cookie. No-op `204` without `LISTEN_TOKEN`. |
| DELETE | `/api/session` | `204`, clears the cookie |
| GET | `/api/tracks?q=&limit=50&offset=0&sort=added\|title\|artist` | `Page<Track>` (limit max 500) |
| GET | `/api/tracks/gone?ids=a,b,…` | `{ gone: string[] }` — the given ids this server deleted (max 500; unknown ids are not "gone") |
| GET | `/api/tracks/:id` | `Track` |
| GET | `/api/tracks/:id/stream` | audio bytes; MUST support `Range` (206), `Accept-Ranges`, `Content-Length`, correct `Content-Type`, `ETag`, `Cache-Control: public, max-age=31536000, immutable` |
| GET | `/api/tracks/:id/lyrics` | `Lyrics` (sidecar `.lrc`/`.txt` → embedded tag → LRCLIB unless `LYRICS_ONLINE=0`); `200` with nulls when none |
| GET | `/api/tracks/:id/artwork?size=512` | `image/jpeg\|png` embedded cover (404 if none); long cache |
| GET | `/api/albums?q=&limit=&offset=` | `Page<Album>` |
| GET | `/api/albums/:id` | `Album & { tracks: Track[] }` (sorted disc, track) |
| GET | `/api/artists?q=&limit=&offset=` | `Page<Artist>` |
| GET | `/api/artists/:id` | `Artist & { albums: Album[]; tracks: Track[] }` |
| GET | `/api/search?q=&limit=20` | `{ tracks: Track[]; albums: Album[]; artists: Artist[] }` |
| POST | `/api/tracks` | multipart `file` (one or more) → `{ items: Track[] }` (admin) |
| DELETE | `/api/tracks/:id` | `204` (admin) |
| POST | `/api/admin/check` | `{ ok: true, maxUploadBytes: number, formats: string[] }` (admin; verifies the token) |
| POST | `/api/rescan` | `{ added: number; removed: number; total: number }` (admin) |
| POST | `/api/imports` | JSON `{ url }` (Spotify playlist/album/track, SoundCloud set/track, YouTube playlist/video) → `202 ImportJob` (admin); `422 { error }` for an unsupported link or a server without yt-dlp/ffmpeg |
| GET | `/api/imports` | `{ items: Omit<ImportJob, "items">[] }` newest first (50) |
| GET | `/api/imports/:id` | `ImportJob` |
| GET | `/api/imports/:id/cover` | `image/jpeg` square cover of the original playlist (404 when `hasCover` is false) |
| POST | `/api/imports/:id/cancel` | `ImportJob` (admin) |
| POST | `/api/imports/:id/retry` | `ImportJob` (admin): re-runs failed songs |
| DELETE | `/api/imports/:id` | `204` (admin): forgets the job; imported songs stay |

`/api/admin/check` also returns `imports: boolean` (yt-dlp + ffmpeg found).

### Playlist imports

```ts
type ImportJob = {
  id: string;                      // 16 hex
  url: string;
  source: "spotify" | "soundcloud" | "youtube" | null;   // null until resolved
  state: "queued" | "resolving" | "running" | "done" | "failed" | "cancelled";
  name: string | null;             // the original playlist's name
  description: string | null;
  owner: string | null;
  hasCover: boolean;
  warning: string | null;          // e.g. Spotify's 100-song limit without API credentials
  error: string | null;
  total: number; done: number; failed: number;
  createdAt: string; updatedAt: string;
  items: { title: string; artist: string; state: "pending" | "downloading" | "done" | "failed";
           track: Track | null; reused: boolean; error: string | null }[];   // original order
};
```

Jobs run one at a time on the server and survive restarts. Songs land in `MUSIC_DIR/imports/` tagged with the
original's title, artists, album, year, track number and cover. Spotify songs are matched on YouTube Music (title,
artists, duration); SoundCloud/YouTube audio is downloaded directly, except SoundCloud Go+ previews, which are matched
on YouTube Music too. A song imported before (same original) is reused, not downloaded again. Playlists stay on the
phone: the app mirrors a job as a local playlist with the same name, cover and order.

Errors: `{ error }` with 4xx/5xx. CORS enabled for all origins (GET).
