# Blednify API contract (v1)

Single source of truth between `apps/server` and `apps/mobile`. Change both sides together.

Base URL: configurable in the app (Settings → Server). Default from `EXPO_PUBLIC_API_URL`.
All JSON. No auth for reads. Writes (upload/delete/rescan) require `Authorization: Bearer <ADMIN_TOKEN>`; a server without `ADMIN_TOKEN` refuses them with `403` unless it runs with `ALLOW_OPEN_WRITES=1`.

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

Errors: `{ error }` with 4xx/5xx. CORS enabled for all origins (GET).
