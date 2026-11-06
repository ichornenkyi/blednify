import type { PlaylistTrack } from "./ytmusic";

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
