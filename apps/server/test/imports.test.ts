import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "../src/app";
import type { ImportJob } from "../src/importer";
import { cleanTitle, isSameSong, pickFile, rankReleases } from "../src/torrent-match";
import { looksLikeLink, parsePlaylistId, parsePlaylistPage, parseSongResults, type Playlist, type PlaylistTrack } from "../src/ytmusic";
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

describe("looksLikeLink", () => {
  test.each(["https://example.com/x", "music.youtube.com/playlist?list=abc", "youtu.be/abc"])("%s is a link", (s) => expect(looksLikeLink(s)).toBe(true));
  test.each(["Queen Bohemian Rhapsody", "AC/DC", "Mr. Brightside", "Океан Ельзи - Обійми", "R.E.M."])("%s is a name", (s) => expect(looksLikeLink(s)).toBe(false));
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
  const songQueries: string[] = [];
  let results: Record<string, unknown[]> = {};
  let jackettStatus = 200;
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
        if (url.searchParams.get("apikey") !== "key" || url.searchParams.get("Category[]") !== "3000") return new Response("", { status: 401 });
        if (jackettStatus !== 200) return new Response("", { status: jackettStatus });
        const q = url.searchParams.get("Query")!;
        searches.push(q);
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

  const setup = (tracks: PlaylistTrack[]) => {
    playlist = { title: "Mix", tracks };
    srv = testServer({}, { JACKETT_URL: `http://localhost:${jackett.port}/`, JACKETT_API_KEY: "key", TORRSERVER_URL: `http://localhost:${torrServer.port}` });
    app = createApp(srv.ctx, async () => playlist, async (q) => {
      songQueries.push(q);
      return q.includes("nothing") ? null : song({ durationMs: 3000 });
    });
  };
  afterEach(() => {
    srv.close();
    torrents.clear();
    live.clear();
    searches.length = 0;
    songQueries.length = 0;
    results = {};
    jackettStatus = 200;
    stream = (t, i) => new Response(t.data[i]);
  });

  const post = (input = "https://music.youtube.com/playlist?list=PLabcdefghij12") =>
    app.request("/api/imports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input }) });
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

  test("a typed name downloads the song YouTube Music finds for it", async () => {
    setup([]);
    const link = addTorrent("h1", { "01 Halo.wav": AUDIO });
    results = { "Beyoncé Halo": [{ Title: "Beyoncé - I Am", MagnetUri: link, Seeders: 5 }] };

    expect((await post("  beyonce   HALO ")).status).toBe(202);
    const job = await finished();

    expect(songQueries).toEqual(["beyonce halo"]);
    expect(job).toMatchObject({ kind: "song", source: "beyonce halo", title: "Beyoncé – Halo" });
    expect(job.tracks[0]?.status).toBe("done");
    expect(uploads(srv.musicDir)).toEqual(["Beyoncé - Halo.wav"]);
  });

  test("a name with no song gives 422, and a bad or blank entry 400, without searching", async () => {
    setup([]);
    expect((await post("nothing like this")).status).toBe(422);
    songQueries.length = 0;
    expect((await post("https://example.com/song")).status).toBe(400);
    expect((await post("   ")).status).toBe(400);
    expect(songQueries).toEqual([]);
    expect(await jobs()).toEqual([]);
  });

  test("YouTube failures give 502", async () => {
    setup([]);
    app = createApp(srv.ctx, async () => {
      throw new Error("boom");
    });
    expect((await post()).status).toBe(502);
  });
});

describe("import access", () => {
  const ENV = { JACKETT_URL: "http://127.0.0.1:1", JACKETT_API_KEY: "k", TORRSERVER_URL: "http://127.0.0.1:1" };
  const body = { method: "POST", body: JSON.stringify({ input: "https://music.youtube.com/playlist?list=PLabcdefghij12" }) };

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
    expect(((await (await srv.app.request("/api/imports")).json()) as { enabled: boolean }).enabled).toBe(true);
    srv.close();
  });
});
