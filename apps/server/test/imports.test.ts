import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "../src/app";
import type { ImportJob } from "../src/importer";
import type { AudioSource } from "../src/ytdlp";
import { cleanTitle, isSameSong } from "../src/track-match";
import { parseAlbumPage, parseAlbumResults, parsePlaylistId, parsePlaylistPage, parseSongResults, type Album, type Playlist, type PlaylistTrack } from "../src/ytmusic";
import { testServer, wav, type TestServer } from "./fixtures";

const song = (over: Partial<PlaylistTrack> = {}): PlaylistTrack => ({
  videoId: "v1",
  title: "Halo",
  artists: ["Beyoncé"],
  album: "I Am",
  durationMs: null,
  ...over,
});

describe("parsePlaylistId", () => {
  test.each([
    ["https://music.youtube.com/playlist?list=PLabcdefghij12", "PLabcdefghij12"],
    ["https://music.youtube.com/watch?v=abc&list=PLabcdefghij12&si=x", "PLabcdefghij12"],
    ["https://www.youtube.com/playlist?list=OLAK5uy_abcdefg", "OLAK5uy_abcdefg"],
    ["https://music.youtube.com/browse/VLPLabcdefghij12", "PLabcdefghij12"],
  ])("accepts %s", (url, id) => expect(parsePlaylistId(url)).toBe(id));

  test.each([
    "not a url",
    "https://evil.example/playlist?list=PLabcdefghij12",
    "https://music.youtube.com.evil.example/playlist?list=PLabcdefghij12",
    "https://music.youtube.com/playlist",
    "https://music.youtube.com/playlist?list=../../x",
  ])("rejects %s", (url) => expect(parsePlaylistId(url)).toBeNull());
});

describe("parseSongResults", () => {
  const link = (text: string, pageType: string) => ({
    text,
    navigationEndpoint: { browseEndpoint: { browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType } } } },
  });
  const column = (runs: object[]) => ({ musicResponsiveListItemFlexColumnRenderer: { text: { runs } } });
  const row = (videoId: string, title: string, meta: object[]) => ({
    musicResponsiveListItemRenderer: { playlistItemData: { videoId }, flexColumns: [column([{ text: title }]), column(meta), column([{ text: "2B plays" }])] },
  });

  test("splits the artist, album and length out of one column", () => {
    const songs = parseSongResults({
      contents: [
        {
          musicShelfRenderer: {
            contents: [
              row("a1", "Under Pressure", [
                link("Queen", "MUSIC_PAGE_TYPE_ARTIST"),
                { text: " & " },
                link("David Bowie", "MUSIC_PAGE_TYPE_ARTIST"),
                { text: " • " },
                link("Hot Space", "MUSIC_PAGE_TYPE_ALBUM"),
                { text: " • " },
                { text: "4:08" },
              ]),
              row("a2", "Unlinked", [{ text: "Someone" }, { text: " • " }, { text: "3:00" }]),
            ],
          },
        },
      ],
    });
    expect(songs).toEqual([
      { videoId: "a1", title: "Under Pressure", artists: ["Queen", "David Bowie"], album: "Hot Space", durationMs: 248000 },
      { videoId: "a2", title: "Unlinked", artists: ["Someone"], album: null, durationMs: 180000 },
    ]);
  });

  test("an empty response has no songs", () => expect(parseSongResults({})).toEqual([]));
});

describe("album parsing", () => {
  const link = (text: string, pageType: string) => ({
    text,
    navigationEndpoint: { browseEndpoint: { browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType } } } },
  });
  const column = (runs: object[]) => ({ musicResponsiveListItemFlexColumnRenderer: { text: { runs } } });

  test("reads the type, artist and year of album results", () => {
    const row = (id: string, title: string, meta: object[]) => ({
      musicResponsiveListItemRenderer: { navigationEndpoint: { browseEndpoint: { browseId: id } }, flexColumns: [column([{ text: title }]), column(meta)] },
    });
    const dot = { text: " • " };
    const albums = parseAlbumResults({
      musicShelfRenderer: {
        contents: [
          row("MPREb_a", "Discovery", [{ text: "Album" }, dot, link("Daft Punk", "MUSIC_PAGE_TYPE_ARTIST"), dot, { text: "2001" }]),
          row("MPREb_b", "Duo", [{ text: "Single" }, dot, link("A", "MUSIC_PAGE_TYPE_ARTIST"), { text: " & " }, link("B", "MUSIC_PAGE_TYPE_ARTIST"), dot, { text: "2025" }]),
          row("MPREb_c", "Plain", [{ text: "EP" }, dot, { text: "Unlinked" }]),
        ],
      },
    });
    expect(albums).toEqual([
      { id: "MPREb_a", title: "Discovery", artists: ["Daft Punk"], type: "Album", year: "2001" },
      { id: "MPREb_b", title: "Duo", artists: ["A", "B"], type: "Single", year: "2025" },
      { id: "MPREb_c", title: "Plain", artists: ["Unlinked"], type: "EP", year: null },
    ]);
  });

  test("gives album tracks the album's artist and title", () => {
    const row = (videoId: string, title: string, artists: object[] = []) => ({
      musicResponsiveListItemRenderer: {
        playlistItemData: { videoId },
        flexColumns: [column([{ text: title }]), { musicResponsiveListItemFlexColumnRenderer: { text: artists.length ? { runs: artists } : {} } }],
        fixedColumns: [{ musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: "5:21" }] } } }],
      },
    });
    const album = parseAlbumPage({
      header: { musicResponsiveHeaderRenderer: { title: { runs: [{ text: "Discovery" }] }, straplineTextOne: { runs: [link("Daft Punk", "MUSIC_PAGE_TYPE_ARTIST")] } } },
      shelf: {
        musicShelfRenderer: {
          contents: [row("t1", "One More Time"), row("t2", "Guest", [{ text: "Someone Else", navigationEndpoint: { browseEndpoint: { browseId: "UC" } } }])],
        },
      },
    });
    expect(album).toEqual({
      title: "Discovery",
      artists: ["Daft Punk"],
      tracks: [
        { videoId: "t1", title: "One More Time", artists: ["Daft Punk"], album: "Discovery", durationMs: 321000 },
        { videoId: "t2", title: "Guest", artists: ["Someone Else"], album: "Discovery", durationMs: 321000 },
      ],
    });
  });

  test("a missing album has no tracks", () => expect(parseAlbumPage({}).tracks).toEqual([]));
});

describe("parsePlaylistPage", () => {
  const artistRun = (text: string) => ({ text, navigationEndpoint: { browseEndpoint: { browseId: "UC" } } });
  const column = (runs: object[]) => ({ musicResponsiveListItemFlexColumnRenderer: { text: { runs } } });
  const item = (videoId: string | null, title: string, artists: object[], album: object[] = [], time = "4:09") => ({
    musicResponsiveListItemRenderer: {
      ...(videoId ? { playlistItemData: { videoId } } : {}),
      flexColumns: [column([{ text: title }]), column(artists), column(album)],
      fixedColumns: [{ musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: time }] } } }],
    },
  });

  test("reads the playlist shelf and ignores other shelves", () => {
    const page = parsePlaylistPage({
      header: { musicResponsiveHeaderRenderer: { title: { runs: [{ text: "My mix" }] } } },
      contents: [
        {
          musicPlaylistShelfRenderer: {
            contents: [
              item("a", "Червоний мак", [artistRun("Zlata Ko"), { text: " & " }, artistRun("Kolibri")], [{ text: "Мак" }], "1:02:03"),
              item(null, "Deleted video", []),
            ],
            continuations: [{ nextContinuationData: { continuation: "NEXT" } }],
          },
        },
        { musicShelfRenderer: { contents: [item("b", "Suggestion", [artistRun("X")])], continuationCommand: { token: "SUGGEST" } } },
      ],
    });
    expect(page).toEqual({
      title: "My mix",
      continuation: "NEXT",
      tracks: [{ videoId: "a", title: "Червоний мак", artists: ["Zlata Ko", "Kolibri"], album: "Мак", durationMs: 3723000 }],
    });
  });

  test("reads a continuation page", () => {
    const page = parsePlaylistPage({
      onResponseReceivedActions: [
        {
          appendContinuationItemsAction: {
            continuationItems: [
              item("c", "Song", [{ text: "Channel" }]),
              { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: "MORE" } } } },
            ],
          },
        },
      ],
    });
    expect(page.continuation).toBe("MORE");
    expect(page.tracks.map((t) => t.artists)).toEqual([["Channel"]]);
  });
});

describe("matching", () => {
  test("cleanTitle drops video noise only", () => {
    expect(cleanTitle(song({ title: "Fantasy (Official 4K Video)" }))).toBe("Fantasy");
    expect(cleanTitle(song({ title: "Beyonce - Halo [HD]" }))).toBe("Halo");
    expect(cleanTitle(song({ title: "Halo feat. Jay" }))).toBe("Halo");
    expect(cleanTitle(song({ title: "Other - Halo" }))).toBe("Other - Halo");
    expect(cleanTitle(song({ title: "(Intro)" }))).toBe("(Intro)");
    expect(cleanTitle(song({ title: 'Go On (from the 2007 DVD "Live In - A...' }))).toBe("Go On");
    expect(cleanTitle(song({ title: "Beyoncé - Абракадабра🔥🎧 | Abrakadabra (Official audio) | Тренд" }))).toBe("Абракадабра");
  });

  test("isSameSong compares title and artist", () => {
    expect(isSameSong(song({ title: "Halo (Official Video)" }), "Halo", "Beyonce")).toBe(true);
    expect(isSameSong(song(), "Halo", "Beyonce, Jay")).toBe(true);
    expect(isSameSong(song(), "Halo", "Other")).toBe(false);
    expect(isSameSong(song(), "Halo 2", "Beyonce")).toBe(false);
  });
});

describe("import job", () => {
  const calls: string[] = [];
  const musicQueries: string[] = [];
  const works: AudioSource = {
    async download(track, dest) {
      calls.push(`${track.videoId}:${dest.slice(dest.lastIndexOf("."))}`);
      await Bun.write(dest, Bun.file(join(import.meta.dir, "assets/halo.m4a")));
    },
  };
  let album: Album = { title: "I Am", artists: ["Beyoncé"], tracks: [] };
  let youtube: AudioSource = works;
  let srv: TestServer;
  let app: ReturnType<typeof createApp>;
  let playlist: Playlist;

  const setup = (tracks: PlaylistTrack[]) => {
    playlist = { title: "Mix", tracks };
    srv = testServer();
    app = createApp(srv.ctx, {
      fetchPlaylist: async () => playlist,
      fetchAlbum: async () => album,
      searchMusic: async (q) => {
        musicQueries.push(q);
        return { songs: [song()], albums: [{ id: "MPREb_a", title: "I Am", artists: ["Beyoncé"], type: "Album", year: "2008" }] };
      },
    }, youtube);
  };
  afterEach(() => {
    srv.close();
    calls.length = 0;
    musicQueries.length = 0;
    album = { title: "I Am", artists: ["Beyoncé"], tracks: [] };
    youtube = works;
  });

  const postJson = (path: string, body: unknown) =>
    app.request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const post = (url = "https://music.youtube.com/playlist?list=PLabcdefghij12") => postJson("/api/imports", { url });
  const jobs = async () => ((await (await app.request("/api/imports")).json()) as { enabled: boolean; items: ImportJob[] }).items;
  const finished = async () => {
    for (let i = 0; i < 500; i++) {
      const job = (await jobs())[0]!;
      if (job.status === "done" || job.status === "cancelled") return job;
      await Bun.sleep(10);
    }
    throw new Error("import did not finish");
  };
  const uploads = (dir: string) => (existsSync(join(dir, "uploads")) ? readdirSync(join(dir, "uploads")) : []);

  test("downloads the song's own video into the library", async () => {
    setup([song({ durationMs: 3000, videoId: "abcdefghijk" })]);
    expect((await post()).status).toBe(202);
    const job = await finished();
    expect(job.status).toBe("done");
    expect(job.tracks[0]).toMatchObject({ status: "done", error: null });
    expect(calls).toEqual(["abcdefghijk:.m4a"]);
    expect(uploads(srv.musicDir)).toEqual(["Beyoncé - Halo.m4a"]);
    expect(srv.ctx.lib.trackRow(job.tracks[0]!.trackId!)).not.toBeNull();
  });

  test("skips a song that is already in the library, without downloading", async () => {
    setup([song({ title: "Halo (Official Video)" })]);
    srv.write("Beyoncé/Halo.wav", wav({ title: "Halo", artist: "Beyoncé" }));
    await srv.ctx.scanner.scan();
    await post();
    expect((await finished()).tracks[0]?.status).toBe("exists");
    expect(calls).toEqual([]);
  });

  test("skips the same song at about the same length", async () => {
    setup([song({ durationMs: 10_000 })]);
    srv.write("Beyoncé/Halo.wav", wav({ title: "Halo", artist: "Beyoncé" }, 3000));
    await srv.ctx.scanner.scan();
    await post();
    expect((await finished()).tracks[0]?.status).toBe("exists");
  });

  test("imports another version of a song in the library, told apart by length", async () => {
    setup([song({ title: "Halo (Radio Edit)", durationMs: 3000 })]);
    srv.write("Beyoncé/Halo.wav", wav({ title: "Halo", artist: "Beyoncé" }, 60_000));
    await srv.ctx.scanner.scan();
    await post();
    expect((await finished()).tracks[0]).toMatchObject({ status: "done", error: null });
    expect(calls).toHaveLength(1);
  });

  test("rejects a download of the wrong length, keeping nothing", async () => {
    setup([song({ durationMs: 200_000 })]);
    await post();
    expect((await finished()).tracks[0]).toMatchObject({ status: "failed", error: "the download has a different length from this song" });
    expect(uploads(srv.musicDir)).toEqual([]);
  });

  test("reports a failed download on the track", async () => {
    youtube = {
      async download() {
        throw new Error("YouTube Music: Video unavailable");
      },
    };
    setup([song()]);
    await post();
    expect((await finished()).tracks[0]).toMatchObject({ status: "failed", error: "YouTube Music: Video unavailable" });
    expect(uploads(srv.musicDir)).toEqual([]);
  });

  test("hostile titles cannot escape the uploads folder", async () => {
    setup([song({ title: "../../evil Halo" })]);
    await post();
    expect((await finished()).tracks[0]?.status).toBe("done");
    expect(uploads(srv.musicDir)).toEqual(["evil Halo.m4a"]);
    expect(existsSync(join(srv.musicDir, "..", "evil Halo.m4a"))).toBe(false);
  });

  test("cancelling stops the job, leaves later tracks pending and cleans up", async () => {
    let downloading = () => {};
    const started = new Promise<void>((resolve) => (downloading = resolve));
    youtube = {
      download: (_track, dest, signal) =>
        new Promise((_, reject) => {
          void Bun.write(dest, "partial").then(downloading);
          signal.addEventListener("abort", () => reject(signal.reason));
        }),
    };
    setup([song(), song({ videoId: "v2", title: "Other" })]);
    const { id } = (await (await post()).json()) as ImportJob;
    await started;
    await app.request(`/api/imports/${id}`, { method: "DELETE" });
    const job = await finished();
    expect(job.status).toBe("cancelled");
    expect(job.tracks.map((t) => t.status)).toEqual(["pending", "pending"]);
    expect(uploads(srv.musicDir)).toEqual([]);

    expect((await app.request(`/api/imports/${job.id}`, { method: "DELETE" })).status).toBe(204);
    expect(await jobs()).toEqual([]);
  });

  test("simultaneous requests for one playlist share a job", async () => {
    setup([song()]);
    const [a, b] = await Promise.all([post(), post()]);
    const [first, second] = (await Promise.all([a.json(), b.json()])) as [ImportJob, ImportJob];
    expect(second.id).toBe(first.id);
    const during = await post();
    expect(((await during.json()) as ImportJob).id).toBe(first.id);
    await finished();
    expect((await jobs()).length).toBe(1);
  });

  test("bad links and empty playlists are refused", async () => {
    setup([]);
    expect((await post("https://example.com/?list=PLabcdefghij12")).status).toBe(400);
    expect((await post()).status).toBe(422);
    expect(await jobs()).toEqual([]);
  });

  test("search lists songs and albums without starting anything", async () => {
    setup([]);
    const res = await postJson("/api/imports/search", { query: "  halo " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      songs: [song()],
      albums: [{ id: "MPREb_a", title: "I Am", artists: ["Beyoncé"], type: "Album", year: "2008" }],
    });
    expect(musicQueries).toEqual(["halo"]);
    expect(await jobs()).toEqual([]);
    expect((await postJson("/api/imports/search", { query: "   " })).status).toBe(400);
  });

  test("a picked song downloads that exact song", async () => {
    setup([]);
    expect((await postJson("/api/imports", { song: song({ durationMs: 3000 }) })).status).toBe(202);
    const job = await finished();
    expect(job).toMatchObject({ kind: "song", source: "v1", title: "Beyoncé – Halo" });
    expect(job.tracks[0]?.status).toBe("done");
    expect(uploads(srv.musicDir)).toEqual(["Beyoncé - Halo.m4a"]);
  });

  test("a picked album downloads each of its tracks", async () => {
    setup([]);
    album = {
      title: "I Am",
      artists: ["Beyoncé"],
      tracks: [song({ videoId: "t1", title: "Halo", durationMs: 3000 }), song({ videoId: "t2", title: "Ego", durationMs: 3000 })],
    };
    expect((await postJson("/api/imports", { albumId: "MPREb_a" })).status).toBe(202);
    const job = await finished();
    expect(job).toMatchObject({ kind: "album", source: "MPREb_a", title: "Beyoncé – I Am" });
    expect(job.tracks.map((t) => t.status)).toEqual(["done", "done"]);
    expect(calls).toEqual(["t1:.m4a", "t2:.m4a"]);
    expect(uploads(srv.musicDir).sort()).toEqual(["Beyoncé - Ego.m4a", "Beyoncé - Halo.m4a"]);
  });

  test("an empty album gives 422, and a bad request 400", async () => {
    setup([]);
    expect((await postJson("/api/imports", { albumId: "MPREb_a" })).status).toBe(422);
    expect((await postJson("/api/imports", { albumId: "../etc" })).status).toBe(400);
    expect((await postJson("/api/imports", { albumId: "MPREb_a", url: "https://music.youtube.com/playlist?list=PLabcdefghij12" })).status).toBe(400);
    expect((await postJson("/api/imports", { song: song({ artists: [] }) })).status).toBe(400);
    expect((await postJson("/api/imports", { url: "some song name" })).status).toBe(400);
    expect((await postJson("/api/imports", {})).status).toBe(400);
    expect(await jobs()).toEqual([]);
  });

  test("YouTube failures give 502", async () => {
    setup([]);
    const boom = async () => {
      throw new Error("boom");
    };
    app = createApp(srv.ctx, { fetchPlaylist: boom, fetchAlbum: boom, searchMusic: boom }, works);
    expect((await postJson("/api/imports/search", { query: "halo" })).status).toBe(502);
    expect((await postJson("/api/imports", { albumId: "MPREb_a" })).status).toBe(502);
    expect((await post()).status).toBe(502);
  });
});

describe("import access", () => {
  // Any installed program turns import on; these requests are refused before it would run.
  const ENV = { YTDLP_PATH: "sh" };
  const body = { method: "POST", body: JSON.stringify({ url: "https://music.youtube.com/playlist?list=PLabcdefghij12" }) };

  test("is off without yt-dlp", async () => {
    const srv = testServer();
    expect(await (await srv.app.request("/api/imports")).json()).toEqual({ enabled: false, items: [] });
    expect((await srv.app.request("/api/imports", body)).status).toBe(503);
    srv.close();
  });

  test("starting and cancelling need the admin token", async () => {
    const srv = testServer({}, { ...ENV, ADMIN_TOKEN: "secret", ALLOW_OPEN_WRITES: "" });
    expect((await srv.app.request("/api/imports", body)).status).toBe(401);
    expect((await srv.app.request("/api/imports/0123456789abcdef", { method: "DELETE" })).status).toBe(401);
    expect((await srv.app.request("/api/imports/search", { method: "POST", body: JSON.stringify({ query: "x" }) })).status).toBe(401);
    expect(((await (await srv.app.request("/api/imports")).json()) as { enabled: boolean }).enabled).toBe(true);
    srv.close();
  });
});
