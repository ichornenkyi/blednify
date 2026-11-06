import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "../src/app";
import type { ImportJob } from "../src/importer";
import type { AudioSource } from "../src/ytdlp";
import { cleanTitle, isSameSong, pickFile, rankReleases } from "../src/torrent-match";
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

  test("rankReleases needs seeders and the artist, and prefers the song's name", () => {
    const release = (title: string, seeders: number) => ({ title, link: `magnet:${title}`, seeders });
    const ranked = rankReleases(
      [
        release("Beyonce - Discography", 500),
        release("BEYONCÉ - Halo [FLAC]", 2),
        release("Beyonce - Dead Album", 0),
        release("Halo OST by someone else", 900),
        release("Beyoncedia - Halo", 900),
      ],
      song(),
    );
    expect(ranked.map((r) => r.title)).toEqual(["BEYONCÉ - Halo [FLAC]", "Beyonce - Discography"]);
  });

  test("pickFile takes the closest audio file and avoids other versions", () => {
    const files = [
      { id: 1, path: "A/01 Halo (Live).mp3", length: 10 },
      { id: 2, path: "A/02 Halo Reprise Extended.mp3", length: 10 },
      { id: 3, path: "A/03 Halo.flac", length: 10 },
      { id: 4, path: "A/Halo.txt", length: 10 },
      { id: 5, path: "A/Halogen.mp3", length: 10 },
    ];
    expect(pickFile(files, song(), 100)?.id).toBe(3);
    expect(pickFile(files, song(), 5)).toBeNull();
    expect(pickFile(files.slice(0, 1), song({ title: "Halo (Live)" }), 100)?.id).toBe(1);
    expect(pickFile([{ id: 1, path: "Червоний мак.mp3", length: 1 }], song({ title: "ЧЕРВОНИЙ МАК" }), 100)?.id).toBe(1);
  });

  test("isSameSong compares title and artist", () => {
    expect(isSameSong(song({ title: "Halo (Official Video)" }), "Halo", "Beyonce")).toBe(true);
    expect(isSameSong(song(), "Halo", "Beyonce, Jay")).toBe(true);
    expect(isSameSong(song(), "Halo", "Other")).toBe(false);
    expect(isSameSong(song(), "Halo 2", "Beyonce")).toBe(false);
  });
});

describe("import job", () => {
  const AUDIO = wav({ title: "Halo", artist: "Beyoncé" }, 3000);

  type Torrent = { hash: string; files: { id: number; path: string; length: number }[]; data: Record<number, Buffer> };
  const torrents = new Map<string, Torrent>();
  const live = new Map<string, Torrent>();
  const searches: string[] = [];
  const trackers: string[][] = [];
  const musicQueries: string[] = [];
  let album: Album = { title: "I Am", artists: ["Beyoncé"], tracks: [] };
  let results: Record<string, unknown[]> = {};
  let jackettStatus = 200;
  let youtube: AudioSource | null = null;
  let stream: (t: Torrent, index: number) => Response = (t, i) => new Response(t.data[i]);
  let jackett: ReturnType<typeof Bun.serve>;
  let torrServer: ReturnType<typeof Bun.serve>;
  let srv: TestServer;
  let app: ReturnType<typeof createApp>;
  let playlist: Playlist;

  const addTorrent = (hash: string, files: Record<string, Buffer>) => {
    const entries = Object.entries(files);
    const torrent: Torrent = {
      hash,
      files: entries.map(([path, b], i) => ({ id: i + 1, path, length: b.length })),
      data: Object.fromEntries(entries.map(([, b], i) => [i + 1, b])),
    };
    torrents.set(`magnet:${hash}`, torrent);
    return `magnet:${hash}`;
  };

  beforeAll(() => {
    jackett = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname.endsWith("/torznab/api")) {
          if (url.searchParams.get("apikey") !== "key") return new Response("", { status: 401 });
          if (jackettStatus !== 200) return new Response("", { status: jackettStatus });
          return new Response(`<indexers>
  <indexer id="rutor" configured="true">
    <title>RuTor</title>
    <caps><categories><category id="8000" name="Other" /></categories></caps>
  </indexer>
  <indexer id="other" configured="false">
    <title>Not set up</title>
  </indexer>
  <indexer id="rb" configured="true">
    <title>Rock &amp; Blues</title>
  </indexer>
</indexers>`);
        }
        if (url.searchParams.get("apikey") !== "key" || url.searchParams.getAll("Category[]").join() !== "3000,8000") return new Response("", { status: 401 });
        if (jackettStatus !== 200) return new Response("", { status: jackettStatus });
        const q = url.searchParams.get("Query")!;
        searches.push(q);
        trackers.push(url.searchParams.getAll("Tracker[]"));
        return Response.json({ Results: results[q] ?? [] });
      },
    });
    torrServer = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/torrents") {
          const body = (await req.json()) as { action: string; link?: string; hash?: string };
          if (body.action === "list") return Response.json([...live.values()].map((t) => ({ hash: t.hash })));
          if (body.action === "add") {
            const t = torrents.get(body.link!)!;
            live.set(t.hash, t);
            return Response.json({ hash: t.hash });
          }
          if (body.action === "get") {
            const t = live.get(body.hash!);
            return t ? Response.json({ hash: t.hash, file_stats: t.files }) : new Response("", { status: 404 });
          }
          if (body.action === "rem") live.delete(body.hash!);
          return new Response("");
        }
        const t = live.get(url.searchParams.get("link")!);
        return t ? stream(t, Number(url.searchParams.get("index"))) : new Response("", { status: 404 });
      },
    });
  });
  afterAll(() => {
    jackett.stop(true);
    torrServer.stop(true);
  });

  const setup = (tracks: PlaylistTrack[], env: Record<string, string> = {}) => {
    playlist = { title: "Mix", tracks };
    srv = testServer({}, { JACKETT_URL: `http://localhost:${jackett.port}/`, JACKETT_API_KEY: "key", TORRSERVER_URL: `http://localhost:${torrServer.port}`, ...env });
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
    torrents.clear();
    live.clear();
    searches.length = 0;
    trackers.length = 0;
    musicQueries.length = 0;
    album = { title: "I Am", artists: ["Beyoncé"], tracks: [] };
    results = {};
    jackettStatus = 200;
    youtube = null;
    stream = (t, i) => new Response(t.data[i]);
  });

  const postJson = (path: string, body: unknown) =>
    app.request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const post = (url = "https://music.youtube.com/playlist?list=PLabcdefghij12", indexer?: string) => postJson("/api/imports", { url, indexer });
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

  test("downloads the matching file into the library and removes the torrent", async () => {
    setup([song({ durationMs: 3000 })]);
    const link = addTorrent("h1", { "I Am/notes.txt": Buffer.from("x"), "I Am/01 Halo.wav": AUDIO });
    results = { "Beyoncé Halo": [{ Title: "Beyoncé - I Am", MagnetUri: link, Seeders: 5 }] };

    const res = await post();
    expect(res.status).toBe(202);
    const job = await finished();

    expect(job.status).toBe("done");
    expect(job.tracks[0]).toMatchObject({ status: "done", error: null });
    expect(uploads(srv.musicDir)).toEqual(["Beyoncé - Halo.wav"]);
    expect(srv.ctx.lib.trackRow(job.tracks[0]!.trackId!)?.title).toBe("Halo");
    expect(live.size).toBe(0);
  });

  test("skips a song that is already in the library, without searching", async () => {
    setup([song({ title: "Halo (Official Video)" })]);
    srv.write("Beyoncé/Halo.wav", wav({ title: "Halo", artist: "Beyoncé" }));
    await srv.ctx.scanner.scan();
    await post();
    const job = await finished();
    expect(job.tracks[0]?.status).toBe("exists");
    expect(searches).toEqual([]);
  });

  test("falls back to the album and artist searches, then to the next release", async () => {
    setup([song()]);
    const noTrack = addTorrent("h1", { "Other.wav": AUDIO });
    const hasTrack = addTorrent("h2", { "Halo.wav": AUDIO });
    results = {
      "Beyoncé I Am": [{ Title: "Beyoncé - I Am", MagnetUri: noTrack, Seeders: 50 }],
      Beyoncé: [
        { Title: "Beyoncé - I Am", MagnetUri: noTrack, Seeders: 50 },
        { Title: "Beyoncé - Discography", Link: hasTrack, Seeders: 3 },
      ],
    };
    await post();
    const job = await finished();
    expect(searches).toEqual(["Beyoncé Halo", "Beyoncé I Am", "Beyoncé"]);
    expect(job.tracks[0]?.status).toBe("done");
    expect(live.size).toBe(0);
  });

  test("rejects a file whose length differs from the playlist's, keeping nothing", async () => {
    setup([song({ durationMs: 200_000 })]);
    const link = addTorrent("h1", { "Halo.wav": AUDIO });
    results = { "Beyoncé Halo": [{ Title: "Beyoncé - Halo", MagnetUri: link, Seeders: 5 }] };
    await post();
    const job = await finished();
    expect(job.tracks[0]).toMatchObject({ status: "failed", error: "the matching file has a different length" });
    expect(uploads(srv.musicDir)).toEqual([]);
  });

  test("a truncated download fails and leaves no file", async () => {
    setup([song()]);
    const link = addTorrent("h1", { "Halo.wav": AUDIO });
    results = { "Beyoncé Halo": [{ Title: "Beyoncé - Halo", MagnetUri: link, Seeders: 5 }] };
    stream = (t, i) => new Response(t.data[i]!.subarray(0, 100));
    await post();
    const job = await finished();
    expect(job.tracks[0]?.status).toBe("failed");
    expect(job.tracks[0]?.error).toContain("incomplete download");
    expect(uploads(srv.musicDir)).toEqual([]);
  });

  test("a torrent the user already had in TorrServer is left there", async () => {
    setup([song()]);
    const link = addTorrent("h1", { "Halo.wav": AUDIO });
    live.set("h1", torrents.get(link)!);
    results = { "Beyoncé Halo": [{ Title: "Beyoncé - Halo", MagnetUri: link, Seeders: 5 }] };
    await post();
    expect((await finished()).tracks[0]?.status).toBe("done");
    expect(live.has("h1")).toBe(true);
  });

  test("hostile titles and torrent paths cannot escape the uploads folder", async () => {
    setup([song({ title: "../../evil Halo" })]);
    const link = addTorrent("h1", { "../../../evil Halo.wav": AUDIO });
    results = { "Beyoncé ../../evil Halo": [{ Title: "Beyoncé - Halo", MagnetUri: link, Seeders: 5 }] };
    await post();
    expect((await finished()).tracks[0]?.status).toBe("done");
    expect(uploads(srv.musicDir)).toEqual(["evil Halo.wav"]);
    expect(existsSync(join(srv.musicDir, "..", "evil Halo.wav"))).toBe(false);
  });

  test("reports a Jackett failure on the track without exposing the key", async () => {
    setup([song()]);
    jackettStatus = 500;
    await post();
    const job = await finished();
    expect(job.tracks[0]).toMatchObject({ status: "failed", error: "Jackett returned HTTP 500" });
    expect(JSON.stringify(job)).not.toContain("key");
  });

  test("cancelling stops the job, leaves later tracks pending and cleans up", async () => {
    setup([song(), song({ videoId: "v2", title: "Other" })]);
    const link = addTorrent("h1", { "Halo.wav": AUDIO });
    results = { "Beyoncé Halo": [{ Title: "Beyoncé - Halo", MagnetUri: link, Seeders: 5 }] };
    let cancel = () => {};
    stream = (_t, _i) => {
      cancel();
      return new Response(new ReadableStream({ pull: () => new Promise(() => {}) }), {});
    };
    const started = (await (await post()).json()) as ImportJob;
    cancel = () => void app.request(`/api/imports/${started.id}`, { method: "DELETE" });
    const job = await finished();
    expect(job.status).toBe("cancelled");
    expect(job.tracks.map((t) => t.status)).toEqual(["pending", "pending"]);
    expect(uploads(srv.musicDir)).toEqual([]);
    expect(live.size).toBe(0);

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

  test("re-reads a file until two reads match, so unverified data is never saved", async () => {
    setup([song({ durationMs: 3000 })]);
    const link = addTorrent("h1", { "Halo.wav": AUDIO });
    results = { "Beyoncé Halo": [{ Title: "Beyoncé - I Am", MagnetUri: link, Seeders: 5 }] };
    let reads = 0;
    stream = (t, i) => {
      reads++;
      return new Response(reads < 3 ? Buffer.alloc(AUDIO.length, reads) : t.data[i]);
    };

    await post();
    const job = await finished();

    expect(job.tracks[0]?.status).toBe("done");
    expect(reads).toBe(4);
    expect(Buffer.from(readFileSync(join(srv.musicDir, "uploads", "Beyoncé - Halo.wav"))).equals(AUDIO)).toBe(true);
  });

  test("gives up on a file whose bytes never settle", async () => {
    setup([song({ durationMs: 3000 })]);
    const link = addTorrent("h1", { "Halo.wav": AUDIO });
    results = { "Beyoncé Halo": [{ Title: "Beyoncé - I Am", MagnetUri: link, Seeders: 5 }] };
    let reads = 0;
    stream = () => new Response(Buffer.alloc(AUDIO.length, ++reads));

    await post();
    const job = await finished();

    expect(job.tracks[0]).toMatchObject({ status: "failed", error: "the torrent kept returning different data" });
    expect(uploads(srv.musicDir)).toEqual([]);
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
    const link = addTorrent("h1", { "01 Halo.wav": AUDIO });
    results = { "Beyoncé Halo": [{ Title: "Beyoncé - I Am", MagnetUri: link, Seeders: 5 }] };

    expect((await postJson("/api/imports", { song: song({ durationMs: 3000 }) })).status).toBe(202);
    const job = await finished();

    expect(job).toMatchObject({ kind: "song", source: "v1", title: "Beyoncé – Halo" });
    expect(job.tracks[0]?.status).toBe("done");
    expect(uploads(srv.musicDir)).toEqual(["Beyoncé - Halo.wav"]);
  });

  test("a picked album downloads its tracks, searching for the album first", async () => {
    setup([]);
    album = {
      title: "I Am",
      artists: ["Beyoncé"],
      tracks: [song({ videoId: "t1", title: "Halo", durationMs: 3000 }), song({ videoId: "t2", title: "Ego", durationMs: 3000 })],
    };
    const link = addTorrent("h1", { "01 Halo.wav": AUDIO, "02 Ego.wav": wav({ title: "Ego", artist: "Beyoncé" }, 3000) });
    results = { "Beyoncé I Am": [{ Title: "Beyoncé - I Am", MagnetUri: link, Seeders: 5 }] };

    expect((await postJson("/api/imports", { albumId: "MPREb_a" })).status).toBe(202);
    const job = await finished();

    expect(job).toMatchObject({ kind: "album", source: "MPREb_a", title: "Beyoncé – I Am" });
    expect(job.tracks.map((t) => t.status)).toEqual(["done", "done"]);
    expect(searches).toEqual(["Beyoncé I Am", "Beyoncé I Am"]);
    expect(uploads(srv.musicDir).sort()).toEqual(["Beyoncé - Ego.wav", "Beyoncé - Halo.wav"]);
    expect(live.size).toBe(0);
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

  test("searches the indexers set for the script of the track's name", async () => {
    setup(
      [
        song({ videoId: "en", title: "Halo", artists: ["Beyoncé"], album: null }),
        song({ videoId: "ua", title: "Обійми", artists: ["Океан Ельзи"], album: null }),
        song({ videoId: "mix", title: "Нон-стоп", artists: ["Molly"], album: null }),
      ],
      { JACKETT_INDEXERS_LATIN: "thepiratebay", JACKETT_INDEXERS_CYRILLIC: " rutor, toloka ," },
    );
    await post();
    await finished();
    const by = Object.fromEntries(searches.map((q, i) => [q, trackers[i]]));
    expect(by["Beyoncé Halo"]).toEqual(["thepiratebay"]);
    expect(by["Океан Ельзи Обійми"]).toEqual(["rutor", "toloka"]);
    expect(by["Molly Нон-стоп"]).toEqual(["rutor", "toloka"]);
  });

  test("a picked tracker replaces the script rule for every track", async () => {
    setup([song({ album: null }), song({ videoId: "ua", title: "Обійми", artists: ["Океан Ельзи"], album: null })], {
      JACKETT_INDEXERS_LATIN: "thepiratebay",
      JACKETT_INDEXERS_CYRILLIC: "rutor",
    });
    expect((await post(undefined, "toloka")).status).toBe(202);
    const job = await finished();
    expect(job.indexer).toBe("toloka");
    expect(new Set(trackers.flat())).toEqual(new Set(["toloka"]));
  });

  test("the same song on another tracker is a separate job", async () => {
    setup([]);
    const first = (await (await postJson("/api/imports", { song: song(), indexer: "rutor" })).json()) as ImportJob;
    const second = (await (await postJson("/api/imports", { song: song(), indexer: "toloka" })).json()) as ImportJob;
    expect(second.id).not.toBe(first.id);
    while ((await jobs()).some((j) => j.status === "queued" || j.status === "running")) await Bun.sleep(10);
  });

  test("a malformed tracker id gives 400", async () => {
    setup([song()]);
    expect((await post(undefined, "a/b&c")).status).toBe(400);
    expect(await jobs()).toEqual([]);
  });

  test("lists only the trackers set up in Jackett", async () => {
    setup([]);
    const res = await app.request("/api/imports/indexers");
    expect(await res.json()).toEqual({
      items: [
        { id: "rutor", name: "RuTor" },
        { id: "rb", name: "Rock & Blues" },
      ],
    });
    jackettStatus = 500;
    expect((await app.request("/api/imports/indexers")).status).toBe(502);
  });

  test("searches every indexer when none are set", async () => {
    setup([song({ album: null })]);
    await post();
    await finished();
    expect(trackers.flat()).toEqual([]);
    expect(searches.length).toBeGreaterThan(0);
  });

  describe("YouTube Music", () => {
    const calls: string[] = [];
    const works: AudioSource = {
      async download(track, dest) {
        calls.push(`${track.videoId}:${dest.slice(dest.lastIndexOf(".") )}`);
        await Bun.write(dest, Bun.file(join(import.meta.dir, "assets/halo.m4a")));
      },
    };
    const fails: AudioSource = {
      async download() {
        throw new Error("YouTube Music: Video unavailable");
      },
    };
    afterEach(() => (calls.length = 0));

    test("downloads the song's own video when picked, without searching trackers", async () => {
      youtube = works;
      setup([song({ durationMs: 3000, videoId: "abcdefghijk" })]);
      await postJson("/api/imports", { song: song({ durationMs: 3000, videoId: "abcdefghijk" }), indexer: "youtube" });
      const job = await finished();
      expect(job.tracks[0]).toMatchObject({ status: "done", error: null });
      expect(calls).toEqual(["abcdefghijk:.m4a"]);
      expect(searches).toEqual([]);
      expect(uploads(srv.musicDir)).toEqual(["Beyoncé - Halo.m4a"]);
      expect(readdirSync(join(srv.musicDir, "uploads")).filter((n) => n.startsWith(".import-"))).toEqual([]);
    });

    test("rejects a download of the wrong length", async () => {
      youtube = works;
      setup([song({ durationMs: 200_000 })]);
      await post(undefined, "youtube");
      expect((await finished()).tracks[0]).toMatchObject({ status: "failed", error: "the matching file has a different length" });
      expect(uploads(srv.musicDir)).toEqual([]);
    });

    test("is the fallback in Auto when no torrent matches", async () => {
      youtube = works;
      setup([song({ durationMs: 3000 })]);
      await post();
      expect((await finished()).tracks[0]).toMatchObject({ status: "done", error: null });
      expect(searches.length).toBeGreaterThan(0);
      expect(calls).toHaveLength(1);
    });

    test("is not tried when a tracker was picked", async () => {
      youtube = works;
      setup([song({ durationMs: 3000 })]);
      await post(undefined, "rutor");
      expect((await finished()).tracks[0]).toMatchObject({ status: "failed", error: "no matching torrent found" });
      expect(calls).toEqual([]);
    });

    test("reports both failures when neither source has the song", async () => {
      youtube = fails;
      setup([song()]);
      await post();
      expect((await finished()).tracks[0]).toMatchObject({ status: "failed", error: "no matching torrent found; YouTube Music: Video unavailable" });
    });

    test("works without Jackett or TorrServer", async () => {
      youtube = works;
      setup([song({ durationMs: 3000 })], { JACKETT_URL: "", JACKETT_API_KEY: "", TORRSERVER_URL: "" });
      expect(await (await app.request("/api/imports/indexers")).json()).toEqual({ items: [{ id: "youtube", name: "YouTube Music" }] });
      await post();
      expect((await finished()).tracks[0]).toMatchObject({ status: "done" });
      expect(searches).toEqual([]);
    });

    test("is listed first, and stays listed when Jackett is down", async () => {
      youtube = works;
      setup([]);
      expect(((await (await app.request("/api/imports/indexers")).json()) as { items: { id: string }[] }).items.map((i) => i.id)).toEqual(["youtube", "rutor", "rb"]);
      jackettStatus = 500;
      expect(await (await app.request("/api/imports/indexers")).json()).toEqual({ items: [{ id: "youtube", name: "YouTube Music" }] });
    });
  });

  test("YouTube failures give 502", async () => {
    setup([]);
    const boom = async () => {
      throw new Error("boom");
    };
    app = createApp(srv.ctx, { fetchPlaylist: boom, fetchAlbum: boom, searchMusic: boom });
    expect((await postJson("/api/imports/search", { query: "halo" })).status).toBe(502);
    expect((await postJson("/api/imports", { albumId: "MPREb_a" })).status).toBe(502);
    expect((await post()).status).toBe(502);
  });
});

describe("import access", () => {
  const ENV = { JACKETT_URL: "http://127.0.0.1:1", JACKETT_API_KEY: "k", TORRSERVER_URL: "http://127.0.0.1:1" };
  const body = { method: "POST", body: JSON.stringify({ url: "https://music.youtube.com/playlist?list=PLabcdefghij12" }) };

  test("is off without configuration", async () => {
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
