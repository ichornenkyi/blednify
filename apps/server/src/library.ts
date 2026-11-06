import type { Db } from "./db";

export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId: string;
  artistId: string;
  durationMs: number;
  trackNumber: number | null;
  discNumber: number | null;
  year: number | null;
  genre: string | null;
  mimeType: string;
  sizeBytes: number;
  bitrate: number | null;
  hasArtwork: boolean;
  addedAt: string;
};
export type Album = {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  year: number | null;
  trackCount: number;
  durationMs: number;
  artworkTrackId: string | null;
};
export type Artist = { id: string; name: string; albumCount: number; trackCount: number; artworkTrackId: string | null };
export type Page<T> = { items: T[]; total: number; limit: number; offset: number };
export type TrackSort = "added" | "title" | "artist";

export type TrackRow = {
  id: string;
  path: string;
  title: string;
  artist: string;
  artist_id: string;
  album: string;
  album_id: string;
  album_artist: string;
  album_artist_id: string;
  duration_ms: number;
  track_no: number | null;
  disc_no: number | null;
  year: number | null;
  genre: string | null;
  mime: string;
  size: number;
  mtime_ms: number;
  bitrate: number | null;
  has_art: number;
  added_at: string;
};
type AlbumRow = {
  id: string;
  title: string;
  artist: string;
  artist_id: string;
  year: number | null;
  track_count: number;
  duration_ms: number;
  artwork_track_id: string | null;
};
type ArtistRow = { id: string; name: string; album_count: number; track_count: number; artwork_track_id: string | null };

export const toTrack = (r: TrackRow): Track => ({
  id: r.id,
  title: r.title,
  artist: r.artist,
  album: r.album,
  albumId: r.album_id,
  artistId: r.artist_id,
  durationMs: r.duration_ms,
  trackNumber: r.track_no,
  discNumber: r.disc_no,
  year: r.year,
  genre: r.genre,
  mimeType: r.mime,
  sizeBytes: r.size,
  bitrate: r.bitrate,
  hasArtwork: r.has_art === 1,
  addedAt: r.added_at,
});
const toAlbum = (r: AlbumRow): Album => ({
  id: r.id,
  title: r.title,
  artist: r.artist,
  artistId: r.artist_id,
  year: r.year,
  trackCount: r.track_count,
  durationMs: r.duration_ms,
  artworkTrackId: r.artwork_track_id,
});
const toArtist = (r: ArtistRow): Artist => ({
  id: r.id,
  name: r.name,
  albumCount: r.album_count,
  trackCount: r.track_count,
  artworkTrackId: r.artwork_track_id,
});

const TRACK_ORDER: Record<TrackSort, string> = {
  added: "t.added_at DESC, t.id",
  title: "t.title COLLATE NOCASE, t.id",
  artist: "t.artist COLLATE NOCASE, t.album COLLATE NOCASE, t.disc_no, t.track_no, t.id",
};
const ALBUM_TRACK_ORDER = "COALESCE(t.disc_no, 1), t.track_no IS NULL, t.track_no, t.title COLLATE NOCASE";

type Table = "tracks" | "albums" | "artists";
const SEARCH_COLUMNS: Record<Table, string[]> = {
  tracks: ["title", "artist", "album"],
  albums: ["title", "artist"],
  artists: ["name"],
};

type Filter = { from: string; where: string; params: string[]; rank: string | null };

/** Splits a free-text query into word tokens (letters/digits/marks), max 8. */
export function tokenize(q: string): string[] {
  return (q.normalize("NFKC").match(/[\p{L}\p{N}\p{M}]+/gu) ?? []).slice(0, 8);
}

export class Library {
  constructor(private readonly db: Db) {}

  private get sql() {
    return this.db.sql;
  }

  // ---------- filters / search ----------

  /** null ⇒ the query cannot match anything. */
  private filter(table: Table, q: string | undefined, useFts = this.db.fts): Filter | null {
    if (!q?.trim()) return { from: `${table} t`, where: "1", params: [], rank: null };
    const tokens = tokenize(q);
    if (tokens.length === 0) return null;
    if (useFts) {
      const fts = `${table}_fts`;
      return {
        from: `${fts} JOIN ${table} t ON t.rowid = ${fts}.rowid`,
        where: `${fts} MATCH ?`,
        params: [tokens.map((tok) => `"${tok}"*`).join(" ")],
        rank: `${fts}.rank`,
      };
    }
    const cols = SEARCH_COLUMNS[table];
    return {
      from: `${table} t`,
      where: tokens.map(() => `(${cols.map((c) => `t.${c} LIKE ? ESCAPE '\\'`).join(" OR ")})`).join(" AND "),
      params: tokens.flatMap((tok) => cols.map(() => `%${tok.replace(/[\\%_]/g, "\\$&")}%`)),
      rank: null,
    };
  }

  private page<R, T>(
    table: Table,
    q: string | undefined,
    order: string | null,
    defaultOrder: string,
    limit: number,
    offset: number,
    map: (row: R) => T,
    withTotal = true,
  ): Page<T> {
    const run = (useFts: boolean): Page<T> => {
      const f = this.filter(table, q, useFts);
      if (!f) return { items: [], total: 0, limit, offset };
      const orderBy = order ?? f.rank ?? defaultOrder;
      const rows = this.sql
        .query<R, (string | number)[]>(`SELECT t.* FROM ${f.from} WHERE ${f.where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
        .all(...f.params, limit, offset);
      const total = withTotal
        ? this.sql.query<{ n: number }, string[]>(`SELECT COUNT(*) AS n FROM ${f.from} WHERE ${f.where}`).get(...f.params)!.n
        : rows.length;
      return { items: rows.map(map), total, limit, offset };
    };
    if (!this.db.fts || !q?.trim()) return run(this.db.fts);
    try {
      return run(true);
    } catch (err) {
      console.warn(`[search] FTS query failed, using LIKE: ${(err as Error).message}`);
      return run(false);
    }
  }

  listTracks(o: { q?: string; sort?: TrackSort; limit: number; offset: number }): Page<Track> {
    const order = o.sort ? TRACK_ORDER[o.sort] : o.q?.trim() ? null : TRACK_ORDER.added;
    return this.page<TrackRow, Track>("tracks", o.q, order, TRACK_ORDER.title, o.limit, o.offset, toTrack);
  }

  listAlbums(o: { q?: string; limit: number; offset: number }): Page<Album> {
    const order = o.q?.trim() ? null : "t.title COLLATE NOCASE, t.id";
    return this.page<AlbumRow, Album>("albums", o.q, order, "t.title COLLATE NOCASE, t.id", o.limit, o.offset, toAlbum);
  }

  listArtists(o: { q?: string; limit: number; offset: number }): Page<Artist> {
    const order = o.q?.trim() ? null : "t.name COLLATE NOCASE, t.id";
    return this.page<ArtistRow, Artist>("artists", o.q, order, "t.name COLLATE NOCASE, t.id", o.limit, o.offset, toArtist);
  }

  search(q: string, limit: number): { tracks: Track[]; albums: Album[]; artists: Artist[] } {
    if (!q.trim()) return { tracks: [], albums: [], artists: [] };
    return {
      tracks: this.page<TrackRow, Track>("tracks", q, null, TRACK_ORDER.title, limit, 0, toTrack, false).items,
      albums: this.page<AlbumRow, Album>("albums", q, null, "t.title COLLATE NOCASE", limit, 0, toAlbum, false).items,
      artists: this.page<ArtistRow, Artist>("artists", q, null, "t.name COLLATE NOCASE", limit, 0, toArtist, false).items,
    };
  }

  // ---------- lookups ----------

  trackCount(): number {
    return this.sql.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM tracks").get()!.n;
  }

  tracksWithoutArt(): TrackRow[] {
    return this.sql.query<TrackRow, []>("SELECT * FROM tracks WHERE has_art = 0 ORDER BY added_at").all();
  }

  trackRow(id: string): TrackRow | null {
    return this.sql.query<TrackRow, [string]>("SELECT * FROM tracks WHERE id = ?").get(id);
  }

  getAlbum(id: string): (Album & { tracks: Track[] }) | null {
    const row = this.sql.query<AlbumRow, [string]>("SELECT * FROM albums WHERE id = ?").get(id);
    if (!row) return null;
    const tracks = this.sql
      .query<TrackRow, [string]>(`SELECT t.* FROM tracks t WHERE t.album_id = ? ORDER BY ${ALBUM_TRACK_ORDER}`)
      .all(id);
    return { ...toAlbum(row), tracks: tracks.map(toTrack) };
  }

  getArtist(id: string): (Artist & { albums: Album[]; tracks: Track[] }) | null {
    const row = this.sql.query<ArtistRow, [string]>("SELECT * FROM artists WHERE id = ?").get(id);
    if (!row) return null;
    const albums = this.sql
      .query<AlbumRow, [string]>(
        `SELECT a.* FROM artist_albums aa JOIN albums a ON a.id = aa.album_id
         WHERE aa.artist_id = ? ORDER BY a.year DESC NULLS LAST, a.title COLLATE NOCASE`,
      )
      .all(id);
    const tracks = this.sql
      .query<TrackRow, [string, string]>(
        `SELECT t.* FROM tracks t WHERE t.artist_id = ? OR t.album_artist_id = ?
         ORDER BY t.year DESC NULLS LAST, t.album COLLATE NOCASE, t.album_id, ${ALBUM_TRACK_ORDER}`,
      )
      .all(id, id);
    return { ...toArtist(row), albums: albums.map(toAlbum), tracks: tracks.map(toTrack) };
  }

  /** path → (size, mtime) of every indexed file, for incremental scans. */
  fileStates(): Map<string, { id: string; size: number; mtimeMs: number }> {
    const rows = this.sql
      .query<{ id: string; path: string; size: number; mtime_ms: number }, []>("SELECT id, path, size, mtime_ms FROM tracks")
      .all();
    return new Map(rows.map((r) => [r.path, { id: r.id, size: r.size, mtimeMs: r.mtime_ms }]));
  }

  // ---------- writes ----------

  /** Inserts or updates tracks (keeps the original addedAt). Returns ids that were new. */
  upsertTracks(rows: TrackRow[]): string[] {
    const exists = this.sql.query<{ x: number }, [string]>("SELECT 1 AS x FROM tracks WHERE id = ?");
    const upsert = this.sql.query(
      `INSERT INTO tracks (id, path, title, artist, artist_id, album, album_id, album_artist, album_artist_id, duration_ms,
         track_no, disc_no, year, genre, mime, size, mtime_ms, bitrate, has_art, added_at)
       VALUES ($id, $path, $title, $artist, $artist_id, $album, $album_id, $album_artist, $album_artist_id, $duration_ms,
         $track_no, $disc_no, $year, $genre, $mime, $size, $mtime_ms, $bitrate, $has_art, $added_at)
       ON CONFLICT(id) DO UPDATE SET
         path = excluded.path, title = excluded.title, artist = excluded.artist, artist_id = excluded.artist_id,
         album = excluded.album, album_id = excluded.album_id, album_artist = excluded.album_artist,
         album_artist_id = excluded.album_artist_id, duration_ms = excluded.duration_ms, track_no = excluded.track_no,
         disc_no = excluded.disc_no, year = excluded.year, genre = excluded.genre, mime = excluded.mime,
         size = excluded.size, mtime_ms = excluded.mtime_ms, bitrate = excluded.bitrate, has_art = excluded.has_art`,
    );
    const added: string[] = [];
    this.sql.transaction(() => {
      for (const row of rows) {
        if (!exists.get(row.id)) added.push(row.id);
        upsert.run(row);
      }
    })();
    return added;
  }

  /** Deletes tracks and retires their ids (see `isIdTaken`). */
  deleteTracks(ids: string[]): void {
    const del = this.sql.query<unknown, [string]>("DELETE FROM tracks WHERE id = ?");
    const retire = this.sql.query<unknown, [string]>("INSERT OR IGNORE INTO retired_ids (id) VALUES (?)");
    this.sql.transaction(() => {
      for (const id of ids) {
        del.run(id);
        retire.run(id);
      }
    })();
  }

  /** True when `id` is indexed now or was ever deleted; new uploads must pick a path with a fresh id. */
  isIdTaken(id: string): boolean {
    return (
      this.sql
        .query<{ x: number }, [string, string]>(
          "SELECT 1 AS x FROM tracks WHERE id = ? UNION ALL SELECT 1 FROM retired_ids WHERE id = ? LIMIT 1",
        )
        .get(id, id) != null
    );
  }

  /** Recomputes albums / artists / artist_albums (and their FTS indexes) from tracks. */
  rebuildAggregates(): void {
    this.sql.transaction(() => {
      this.sql.exec(/* sql */ `
        DELETE FROM albums;
        DELETE FROM artists;
        DELETE FROM artist_albums;

        INSERT INTO albums (id, title, artist, artist_id, year, track_count, duration_ms, artwork_track_id)
        SELECT t.album_id, MIN(t.album), MIN(t.album_artist), MIN(t.album_artist_id), MAX(t.year), COUNT(*), SUM(t.duration_ms),
          (SELECT x.id FROM tracks x WHERE x.album_id = t.album_id AND x.has_art = 1
           ORDER BY COALESCE(x.disc_no, 1), x.track_no IS NULL, x.track_no LIMIT 1)
        FROM tracks t GROUP BY t.album_id;

        INSERT INTO artist_albums (artist_id, album_id)
        SELECT artist_id, album_id FROM tracks UNION SELECT album_artist_id, album_id FROM tracks;

        INSERT INTO artists (id, name, album_count, track_count, artwork_track_id)
        WITH links(aid, name, tid) AS (
          SELECT artist_id, artist, id FROM tracks UNION SELECT album_artist_id, album_artist, id FROM tracks
        )
        SELECT l.aid, MIN(l.name),
          (SELECT COUNT(*) FROM artist_albums aa WHERE aa.artist_id = l.aid),
          COUNT(DISTINCT l.tid),
          (SELECT a.artwork_track_id FROM artist_albums aa JOIN albums a ON a.id = aa.album_id
           WHERE aa.artist_id = l.aid AND a.artwork_track_id IS NOT NULL
           ORDER BY a.artist_id = l.aid DESC, a.year DESC NULLS LAST LIMIT 1)
        FROM links l GROUP BY l.aid;
      `);
      if (this.db.fts) {
        this.sql.exec("INSERT INTO albums_fts(albums_fts) VALUES ('rebuild')");
        this.sql.exec("INSERT INTO artists_fts(artists_fts) VALUES ('rebuild')");
      }
    })();
  }
}
