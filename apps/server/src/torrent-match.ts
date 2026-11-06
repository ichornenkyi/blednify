import { basename } from "node:path";
import { audioMime } from "./ids";
import type { PlaylistTrack } from "./ytmusic";

export type Release = { title: string; link: string; seeders: number };
export type TorrentFile = { id: number; path: string; length: number };

const VARIANT_WORDS = ["instrumental", "karaoke", "remix", "live", "acapella", "a cappella", "cover"];

/** Case, accent and punctuation-insensitive form, for any script. */
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Whole-word containment, so "love" does not match "lovesong". */
const hasPhrase = (haystack: string, needle: string) => needle !== "" && ` ${haystack} `.includes(` ${needle} `);

/** The title without the "(Official Video)", "feat. X" or leading "Artist - " that video titles carry. */
export function cleanTitle(track: Pick<PlaylistTrack, "title" | "artists">): string {
  let title = track.title
    .replace(/\s\|.*$/, " ")
    .replace(/\([^)]*(\)|$)|\[[^\]]*(\]|$)/g, " ")
    .replace(/\s(feat|ft)\.?\s.*$/i, " ")
    .replace(/\p{Extended_Pictographic}|\.{3,}$/gu, " ");
  const dash = title.indexOf(" - ");
  if (dash > 0 && track.artists.some((a) => normalize(a) === normalize(title.slice(0, dash)))) title = title.slice(dash + 3);
  return title.replace(/\s+/g, " ").trim() || track.title;
}

const songName = (track: Pick<PlaylistTrack, "title" | "artists">) => normalize(cleanTitle(track));

/** Releases worth opening, best first: seeded, by this artist, with the song's name in the title ranked ahead. */
export function rankReleases(releases: Release[], track: PlaylistTrack): Release[] {
  const artists = track.artists.map(normalize);
  const song = songName(track);
  const scored = releases
    .map((release) => ({ release, name: normalize(release.title) }))
    .filter(({ release, name }) => release.seeders > 0 && artists.some((a) => hasPhrase(name, a)));
  return scored
    .sort((a, b) => Number(hasPhrase(b.name, song)) - Number(hasPhrase(a.name, song)) || b.release.seeders - a.release.seeders)
    .map(({ release }) => release);
}

/** The audio file for this song in a torrent: the closest name, ignoring live/remix/etc. unless the song is one. */
export function pickFile(files: TorrentFile[], track: PlaylistTrack, maxBytes: number): TorrentFile | null {
  const song = songName(track);
  const fullTitle = normalize(track.title);
  const rejected = VARIANT_WORDS.filter((w) => !hasPhrase(fullTitle, w));
  let best: { file: TorrentFile; extra: number } | null = null;
  for (const file of files) {
    if (!audioMime(file.path) || file.length > maxBytes) continue;
    const name = normalize(basename(file.path).replace(/\.[^.]+$/, ""));
    if (!hasPhrase(name, song) || rejected.some((w) => hasPhrase(name, w))) continue;
    const extra = name.length - song.length;
    if (!best || extra < best.extra) best = { file, extra };
  }
  return best?.file ?? null;
}

/** Whether `candidate` is a live, remix or karaoke version that `own` is not. */
export function isOtherVersion(candidate: string, own: string): boolean {
  const [a, b] = [normalize(candidate), normalize(own)];
  return VARIANT_WORDS.some((w) => hasPhrase(a, w) && !hasPhrase(b, w));
}

/** Whether a library track is this playlist track. */
export function isSameSong(track: PlaylistTrack, title: string, artist: string): boolean {
  const name = normalize(artist);
  return songName({ title, artists: [artist] }) === songName(track) && track.artists.some((a) => hasPhrase(name, normalize(a)));
}
