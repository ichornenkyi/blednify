/** Picks the YouTube (Music) upload that is the same recording as a Spotify track. Pure, so it is unit-tested. */

export const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Words that mark a different version; a candidate with one the wanted title lacks is penalised. */
const VERSION_WORDS = ["live", "remix", "cover", "karaoke", "instrumental", "acoustic", "sped up", "slowed", "nightcore", "reverb", "8d", "edit", "remaster", "demo", "version"];

/** Drops "(feat. X)", "- Remastered 2011" style suffixes for comparison. */
export const coreTitle = (title: string) =>
  norm(title.replace(/\s*[([](feat\.?|ft\.?|with)\s[^)\]]*[)\]]/gi, "").replace(/\s+-\s+.*(remaster|version|edit|mix).*$/i, ""));

function overlap(a: string, b: string): number {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / A.size;
}

export type Wanted = { title: string; artists: string[]; durationMs: number | null };
export type Candidate = { title: string; artists: string[]; durationSec: number | null };

/** 0..1; below ~0.55 the candidate should not be used. */
export function score(want: Wanted, c: Candidate): number {
  const wt = coreTitle(want.title);
  const ct = norm(c.title);
  let s = 0.5 * overlap(wt, ct);
  const wantArtists = want.artists.map(norm).filter(Boolean);
  const candArtists = norm(c.artists.join(" "));
  if (!wantArtists.length) s += 0.25;
  else if (wantArtists.some((a) => candArtists.includes(a) || ct.includes(a))) s += 0.25;
  else if (wantArtists.some((a) => overlap(a, candArtists) >= 0.5)) s += 0.12;
  if (want.durationMs && c.durationSec) {
    const diff = Math.abs(want.durationMs / 1000 - c.durationSec);
    s += diff <= 3 ? 0.25 : diff <= 8 ? 0.18 : diff <= 20 ? 0.05 : -0.3;
  } else s += 0.1;
  const wantNorm = norm(want.title);
  for (const w of VERSION_WORDS) {
    const re = new RegExp(`\\b${w}\\b`);
    if (re.test(ct) && !re.test(wantNorm)) s -= 0.25;
  }
  return s;
}

export const GOOD_MATCH = 0.75;
export const MIN_MATCH = 0.55;
