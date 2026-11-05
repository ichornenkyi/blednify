# Blednify API contract (v1)

Single source of truth between `apps/server` and `apps/mobile`. Change both sides together.

Base URL: configurable in the app (Settings → Server). Default from `EXPO_PUBLIC_API_URL`.
All JSON. No auth for reads. Writes (upload/delete/rescan/import) require `Authorization: Bearer <ADMIN_TOKEN>`; a server without `ADMIN_TOKEN` refuses them with `403` unless it runs with `ALLOW_OPEN_WRITES=1`.

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
```

```ts
type ImportSong = { videoId: string; title: string; artists: string[]; album: string | null; durationMs: number | null };
type ImportAlbum = { id: string; title: string; artists: string[]; type: string; year: string | null }; // type: "Album", "Single", "EP"
type ImportJob = {
  id: string;
  kind: "playlist" | "album" | "song";
  source: string;        // the YouTube Music id of the playlist, album or song
  indexer: string | null; // the picked Jackett indexer; null means chosen per track by the server
  title: string;
  status: "queued" | "running" | "done" | "cancelled";
  createdAt: string; // ISO 8601
  tracks: {
    videoId: string;
    title: string;
    artists: string[];
    album: string | null;
    durationMs: number | null;
    status: "pending" | "searching" | "downloading" | "done" | "exists" | "failed";
    error: string | null;
    trackId: string | null; // set for "done" and "exists"
  }[];
};
```

## Endpoints

| Method | Path | Result |
|---|---|---|
| GET | `/api/health` | `{ ok: true, name: "blednify", version: string, trackCount: number }` |
| GET | `/api/tracks?q=&limit=50&offset=0&sort=added\|title\|artist` | `Page<Track>` (limit max 500) |
| GET | `/api/tracks/:id` | `Track` |
| GET | `/api/tracks/:id/stream` | audio bytes; MUST support `Range` (206), `Accept-Ranges`, `Content-Length`, correct `Content-Type`, `ETag`, `Cache-Control: public, max-age=31536000, immutable` |
| GET | `/api/tracks/:id/artwork?size=512` | `image/jpeg\|png` embedded cover (404 if none); long cache |
| GET | `/api/albums?q=&limit=&offset=` | `Page<Album>` |
| GET | `/api/albums/:id` | `Album & { tracks: Track[] }` (sorted disc, track) |
| GET | `/api/artists?q=&limit=&offset=` | `Page<Artist>` |
| GET | `/api/artists/:id` | `Artist & { albums: Album[]; tracks: Track[] }` |
| GET | `/api/search?q=&limit=20` | `{ tracks: Track[]; albums: Album[]; artists: Artist[] }` |
| POST | `/api/tracks` | multipart `file` (one or more) → `{ items: Track[] }` (admin) |
| DELETE | `/api/tracks/:id` | `204` (admin) |
| POST | `/api/rescan` | `{ added: number; removed: number; total: number }` (admin) |
| GET | `/api/imports` | `{ enabled: boolean; items: ImportJob[] }`, newest first |
| GET | `/api/imports/indexers` | `{ items: { id: string; name: string }[] }`, the trackers set up in Jackett. `502` Jackett failed, `503` import not configured |
| POST | `/api/imports/search` | JSON `{ query: string }` → `{ songs: ImportSong[]; albums: ImportAlbum[] }`, up to 6 of each, best first. Starts nothing. `400` blank query, `502` YouTube Music failed, `503` import not configured (admin) |
| POST | `/api/imports` | JSON with one of `{ url: string }` (playlist link), `{ albumId: string }` or `{ song: ImportSong }`, plus optional `indexer: string \| null` to search only that tracker → `202 ImportJob`; the running job if the same request is already importing. `400` bad request or a link that is not a playlist, `422` empty or private playlist, or empty album, `502` YouTube Music failed, `503` import not configured (admin) |
| DELETE | `/api/imports/:id` | Cancels a queued or running job, or forgets a finished one → `204` (admin) |

Errors: `{ error }` with 4xx/5xx. CORS enabled for all origins (GET).
