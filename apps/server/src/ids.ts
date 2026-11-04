import { createHash } from "node:crypto";
import { extname } from "node:path";

export const UNKNOWN_ARTIST = "Unknown Artist";
export const UNKNOWN_ALBUM = "Unknown Album";

const AUDIO_MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
};

export const AUDIO_EXTENSIONS = Object.keys(AUDIO_MIME);

/** Lowercased extension → mime type, or null when the file is not a supported audio file. */
export function audioMime(path: string): string | null {
  return AUDIO_MIME[extname(path).toLowerCase()] ?? null;
}

export const hash16 = (value: string) => createHash("sha1").update(value).digest("hex").slice(0, 16);

/** Track id: sha1 of the path relative to MUSIC_DIR (always `/`-separated). */
export const trackId = (relPath: string) => hash16(relPath);
export const artistId = (artist: string) => hash16(artist);
export const albumId = (artist: string, album: string) => hash16(`${artist}\u0000${album}`);
