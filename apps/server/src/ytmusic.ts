export type PlaylistTrack = {
  videoId: string;
  title: string;
  artists: string[];
  album: string | null;
  durationMs: number | null;
};
export type Playlist = { title: string; tracks: PlaylistTrack[] };
export type Album = Playlist & { artists: string[] };
export type AlbumResult = { id: string; title: string; artists: string[]; type: string; year: string | null };
export type MusicResults = { songs: PlaylistTrack[]; albums: AlbumResult[] };

const YT_HOSTS = new Set(["music.youtube.com", "www.youtube.com", "youtube.com", "m.youtube.com"]);
const LIST_ID_RE = /^[A-Za-z0-9_-]{10,}$/;
const API_BASE = "https://music.youtube.com/youtubei/v1";
/** YouTube Music's "Songs" search filter. */
const SONGS_FILTER = "EgWKAQIIAWoKEAkQBRAKEAMQBA==";
/** YouTube Music's "Albums" search filter, which also covers singles and EPs. */
const ALBUMS_FILTER = "EgWKAQIYAWoKEAkQBRAKEAMQBA==";
const MAX_RESULTS = 6;
const CLIENT = { clientName: "WEB_REMIX", clientVersion: "1.20260101.01.00", hl: "en" };
const MAX_PAGES = 100;
const REQUEST_TIMEOUT_MS = 20_000;

/** Playlist id from a YouTube (Music) link, or null. Only the id ever leaves this function, so no user URL is fetched. */
export function parsePlaylistId(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!YT_HOSTS.has(url.hostname)) return null;
  const browse = /^\/browse\/VL([^/]+)$/.exec(url.pathname)?.[1];
  const id = url.searchParams.get("list") ?? browse;
  return id && LIST_ID_RE.test(id) ? id : null;
}

type Json = Record<string, any>;

function collect(node: unknown, key: string, out: unknown[] = []): unknown[] {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, key, out);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === key) out.push(v);
      collect(v, key, out);
    }
  }
  return out;
}

function parseDuration(text: string | undefined): number | null {
  if (!text || !/^\d+(:\d+)+$/.test(text)) return null;
  return text.split(":").reduce((total, part) => total * 60 + Number(part), 0) * 1000;
}

function parseItem(item: Json): PlaylistTrack | null {
  const columns = (item.flexColumns ?? []).map((c: Json) => c.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? []);
  const titleRun = columns[0]?.[0];
  const videoId = item.playlistItemData?.videoId ?? titleRun?.navigationEndpoint?.watchEndpoint?.videoId;
  const title = titleRun?.text?.trim();
  if (!videoId || !title) return null;
  const artistRuns: Json[] = columns[1] ?? [];
  const linked = artistRuns.filter((r) => r.navigationEndpoint?.browseEndpoint);
  const artists = (linked.length ? linked : artistRuns.slice(0, 1)).map((r) => String(r.text).trim()).filter(Boolean);
  const fixed = item.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text;
  return { videoId, title, artists, album: columns[2]?.[0]?.text?.trim() || null, durationMs: parseDuration(fixed) };
}

/** One browse response → its tracks and the token of the next page. */
export function parsePlaylistPage(page: Json): { title: string | null; tracks: PlaylistTrack[]; continuation: string | null } {
  // The first page's own shelf: playlists can also carry a "suggestions" shelf with its own items and token.
  const scope = collect(page, "musicPlaylistShelfRenderer")[0] ?? page;
  const header = (collect(page, "musicResponsiveHeaderRenderer")[0] ?? collect(page, "musicDetailHeaderRenderer")[0]) as Json | undefined;
  const items = collect(scope, "musicResponsiveListItemRenderer") as Json[];
  const command = collect(scope, "continuationCommand")[0] as Json | undefined;
  const next = collect(scope, "nextContinuationData")[0] as Json | undefined;
  return {
    title: header?.title?.runs?.[0]?.text ?? null,
    tracks: items.flatMap((item) => parseItem(item) ?? []),
    continuation: command?.token ?? next?.continuation ?? null,
  };
}

const pageTypeOf = (run: Json): string | undefined =>
  run.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;

/** One song search response → its songs. Search rows hold "Artist • Album • 3:45" in a single column. */
export function parseSongResults(page: Json): PlaylistTrack[] {
  const scope = collect(page, "musicShelfRenderer")[0] ?? page;
  return (collect(scope, "musicResponsiveListItemRenderer") as Json[]).flatMap((item) => {
    const track = parseItem(item);
    if (!track) return [];
    const runs: Json[] = item.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? [];
    const linked = runs.filter((r) => pageTypeOf(r) === "MUSIC_PAGE_TYPE_ARTIST");
    const artists = (linked.length ? linked : runs.slice(0, 1)).map((r) => String(r.text).trim()).filter(Boolean);
    const album = runs.find((r) => pageTypeOf(r) === "MUSIC_PAGE_TYPE_ALBUM")?.text?.trim() || null;
    return [{ ...track, artists, album, durationMs: parseDuration(runs.at(-1)?.text) }];
  });
}

/** One album search response → its albums. Rows hold "Album • Artist • 2001" in a single column. */
export function parseAlbumResults(page: Json): AlbumResult[] {
  const scope = collect(page, "musicShelfRenderer")[0] ?? page;
  return (collect(scope, "musicResponsiveListItemRenderer") as Json[]).flatMap((item) => {
    const id = item.navigationEndpoint?.browseEndpoint?.browseId;
    const columns = (item.flexColumns ?? []).map((c: Json) => c.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? []);
    const title = columns[0]?.[0]?.text?.trim();
    if (typeof id !== "string" || !title) return [];
    const runs: Json[] = columns[1] ?? [];
    const last = runs.at(-1)?.text?.trim();
    const year = /^\d{4}$/.test(last ?? "") ? last : null;
    const artists = runs
      .filter((r) => pageTypeOf(r) === "MUSIC_PAGE_TYPE_ARTIST")
      .map((r) => String(r.text).trim());
    const unlinked = runs.map((r) => String(r.text).trim()).filter((t, i) => i > 0 && t && t !== "•" && t !== year);
    return [{ id, title, artists: artists.length ? artists : unlinked.slice(0, 1), type: String(runs[0]?.text ?? "Album").trim(), year }];
  });
}

/** One album page → its title, artists and tracks. Rows only name an artist when it differs from the album's. */
export function parseAlbumPage(page: Json): Album {
  const header = collect(page, "musicResponsiveHeaderRenderer")[0] as Json | undefined;
  const title = header?.title?.runs?.[0]?.text?.trim() ?? "YouTube Music album";
  const strapline: Json[] = header?.straplineTextOne?.runs ?? [];
  const linked = strapline.filter((r) => pageTypeOf(r) === "MUSIC_PAGE_TYPE_ARTIST");
  const artists = (linked.length ? linked : strapline.slice(0, 1)).map((r) => String(r.text).trim()).filter(Boolean);
  const scope = collect(page, "musicShelfRenderer")[0] ?? page;
  const tracks = (collect(scope, "musicResponsiveListItemRenderer") as Json[]).flatMap((item) => {
    const track = parseItem(item);
    return track ? [{ ...track, artists: track.artists.length ? track.artists : artists, album: title }] : [];
  });
  return { title, artists, tracks };
}

async function callYouTube(endpoint: "browse" | "search", body: Json): Promise<Json> {
  const res = await fetch(`${API_BASE}/${endpoint}?prettyPrint=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://music.youtube.com", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({ context: { client: CLIENT }, ...body }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`YouTube Music returned HTTP ${res.status}`);
  return (await res.json()) as Json;
}

/** The songs and albums YouTube Music finds for a typed name, best first. */
export async function searchMusic(query: string): Promise<MusicResults> {
  const [songs, albums] = await Promise.all([
    callYouTube("search", { query, params: SONGS_FILTER }).then(parseSongResults),
    callYouTube("search", { query, params: ALBUMS_FILTER }).then(parseAlbumResults),
  ]);
  return { songs: songs.filter((s) => s.artists.length > 0).slice(0, MAX_RESULTS), albums: albums.slice(0, MAX_RESULTS) };
}

/** Reads an album by its YouTube Music id; returns no tracks when it is gone. */
export async function fetchAlbum(albumId: string): Promise<Album> {
  return parseAlbumPage(await callYouTube("browse", { browseId: albumId }));
}

/** Reads a public or unlisted playlist through YouTube Music's own web API; returns no tracks when it is private or gone. */
export async function fetchPlaylist(playlistId: string): Promise<Playlist> {
  const browse = (body: Json) => callYouTube("browse", body);
  const first = parsePlaylistPage(await browse({ browseId: `VL${playlistId}` }));
  const seen = new Set<string>();
  const tracks: PlaylistTrack[] = [];
  const add = (items: PlaylistTrack[]) => {
    for (const t of items) {
      if (seen.has(t.videoId)) continue;
      seen.add(t.videoId);
      tracks.push(t);
    }
  };
  add(first.tracks);
  let token = first.continuation;
  for (let i = 0; token && i < MAX_PAGES; i++) {
    const page = parsePlaylistPage(await browse({ continuation: token }));
    add(page.tracks);
    token = page.continuation;
  }
  return { title: first.title ?? "YouTube Music playlist", tracks };
}
