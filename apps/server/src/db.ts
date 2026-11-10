import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export type Db = { sql: Database; fts: boolean };

const SCHEMA_VERSION = 1;

const SCHEMA = /* sql */ `
-- Per-install backup of the app's playlists and likes. id is the sha256 of the install's secret key (the raw
-- key is never stored); data is an opaque JSON object the server never interprets.
CREATE TABLE IF NOT EXISTS libraries (
  id         TEXT PRIMARY KEY,
  version    INTEGER NOT NULL,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tracks (
  id              TEXT PRIMARY KEY,
  path            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  artist          TEXT NOT NULL,
  artist_id       TEXT NOT NULL,
  album           TEXT NOT NULL,
  album_id        TEXT NOT NULL,
  album_artist    TEXT NOT NULL,
  album_artist_id TEXT NOT NULL,
  duration_ms     INTEGER NOT NULL,
  track_no        INTEGER,
  disc_no         INTEGER,
  year            INTEGER,
  genre           TEXT,
  mime            TEXT NOT NULL,
  size            INTEGER NOT NULL,
  mtime_ms        INTEGER NOT NULL,
  bitrate         INTEGER,
  has_art         INTEGER NOT NULL,
  added_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tracks_added ON tracks(added_at DESC, id);
CREATE INDEX IF NOT EXISTS tracks_title ON tracks(title COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS tracks_artist_sort ON tracks(artist COLLATE NOCASE, album COLLATE NOCASE, disc_no, track_no, id);
CREATE INDEX IF NOT EXISTS tracks_album ON tracks(album_id, disc_no, track_no);
CREATE INDEX IF NOT EXISTS tracks_artist_id ON tracks(artist_id);
CREATE INDEX IF NOT EXISTS tracks_album_artist_id ON tracks(album_artist_id);

CREATE TABLE IF NOT EXISTS albums (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  artist           TEXT NOT NULL,
  artist_id        TEXT NOT NULL,
  year             INTEGER,
  track_count      INTEGER NOT NULL,
  duration_ms      INTEGER NOT NULL,
  artwork_track_id TEXT
);
CREATE INDEX IF NOT EXISTS albums_title ON albums(title COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS albums_artist_id ON albums(artist_id);

CREATE TABLE IF NOT EXISTS artists (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  album_count      INTEGER NOT NULL,
  track_count      INTEGER NOT NULL,
  artwork_track_id TEXT
);
CREATE INDEX IF NOT EXISTS artists_name ON artists(name COLLATE NOCASE, id);

-- ids of tracks that were deleted/removed. Uploads never reuse them: clients cache streams immutably and key
-- downloads by id, so an id must never point at different audio.
CREATE TABLE IF NOT EXISTS retired_ids (id TEXT PRIMARY KEY) WITHOUT ROWID;

-- playlist imports: the job document is JSON (items included), so the shape can grow without migrations
CREATE TABLE IF NOT EXISTS imports (
  id         TEXT PRIMARY KEY,
  doc        TEXT NOT NULL,
  created_at TEXT NOT NULL
) WITHOUT ROWID;

-- where imported audio came from (spotify:track:…, youtube:…, soundcloud:…), so re-imports reuse the file
CREATE TABLE IF NOT EXISTS import_sources (
  source   TEXT PRIMARY KEY,
  track_id TEXT NOT NULL
) WITHOUT ROWID;

-- every album an artist appears on, as track artist or album artist
CREATE TABLE IF NOT EXISTS artist_albums (
  artist_id TEXT NOT NULL,
  album_id  TEXT NOT NULL,
  PRIMARY KEY (artist_id, album_id)
) WITHOUT ROWID;
`;

const TOKENIZE = `tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3'`;

const FTS = /* sql */ `
CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(title, artist, album, content = 'tracks', content_rowid = 'rowid', ${TOKENIZE});
CREATE VIRTUAL TABLE IF NOT EXISTS albums_fts USING fts5(title, artist, content = 'albums', content_rowid = 'rowid', ${TOKENIZE});
CREATE VIRTUAL TABLE IF NOT EXISTS artists_fts USING fts5(name, content = 'artists', content_rowid = 'rowid', ${TOKENIZE});
CREATE TRIGGER IF NOT EXISTS tracks_fts_ai AFTER INSERT ON tracks BEGIN
  INSERT INTO tracks_fts(rowid, title, artist, album) VALUES (new.rowid, new.title, new.artist, new.album);
END;
CREATE TRIGGER IF NOT EXISTS tracks_fts_ad AFTER DELETE ON tracks BEGIN
  INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album) VALUES ('delete', old.rowid, old.title, old.artist, old.album);
END;
CREATE TRIGGER IF NOT EXISTS tracks_fts_au AFTER UPDATE ON tracks BEGIN
  INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album) VALUES ('delete', old.rowid, old.title, old.artist, old.album);
  INSERT INTO tracks_fts(rowid, title, artist, album) VALUES (new.rowid, new.title, new.artist, new.album);
END;
`;

export function openDb(dataDir: string): Db {
  mkdirSync(dataDir, { recursive: true });
  const sql = new Database(join(dataDir, "blednify.db"), { create: true, strict: true });
  sql.exec("PRAGMA journal_mode = WAL");
  sql.exec("PRAGMA synchronous = NORMAL");
  sql.exec("PRAGMA busy_timeout = 5000");
  sql.exec("PRAGMA temp_store = MEMORY");
  sql.exec(SCHEMA);
  sql.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return { sql, fts: setupFts(sql) };
}

/** Creates FTS5 tables + sync triggers. Returns false (search falls back to LIKE) if FTS5 is unavailable. */
function setupFts(sql: Database): boolean {
  const existed = sql.query("SELECT 1 FROM sqlite_master WHERE name = 'tracks_fts'").get() != null;
  try {
    sql.transaction(() => {
      sql.exec(FTS);
      if (!existed) sql.exec("INSERT INTO tracks_fts(tracks_fts) VALUES ('rebuild')");
    })();
    return true;
  } catch (err) {
    console.warn(`[db] FTS5 unavailable, search falls back to LIKE: ${(err as Error).message}`);
    for (const t of ["tracks_fts_ai", "tracks_fts_ad", "tracks_fts_au"]) sql.exec(`DROP TRIGGER IF EXISTS ${t}`);
    return false;
  }
}
