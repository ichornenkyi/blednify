import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFile } from "music-metadata";
import { Covers } from "../src/covers";
import type { PlaylistTrack } from "../src/ytmusic";
import { testServer, wav, type TestServer } from "./fixtures";

const asset = (name: string) => readFileSync(join(import.meta.dir, "assets", name));
const BARE = asset("bare.m4a");
const COVER = asset("cover.jpg");
const halo = (over: Partial<PlaylistTrack> = {}): PlaylistTrack => ({ videoId: "abcdefghijk", title: "Halo", artists: ["Beyoncé"], album: null, durationMs: 3000, ...over });
const signal = () => new AbortController().signal;

describe.skipIf(!Bun.which("ffmpeg"))("covers", () => {
  let srv: TestServer;
  const urls: string[] = [];
  afterEach(() => {
    srv.close();
    urls.length = 0;
  });

  const setup = async (files: Record<string, Buffer>, songs: PlaylistTrack[], image: (url: string) => Buffer | null = () => COVER) => {
    srv = testServer(files);
    await srv.ctx.scanner.scan();
    return new Covers({
      lib: srv.ctx.lib,
      scanner: srv.ctx.scanner,
      musicDir: srv.musicDir,
      searchMusic: async () => ({ songs, albums: [] }),
      fetchImage: async (url) => {
        urls.push(url);
        return image(url);
      },
    });
  };
  const only = () => srv.ctx.lib.tracksWithoutArt();

  test("adds the cover to the file, keeps its tags and gives the track artwork", async () => {
    const covers = await setup({ "Beyoncé/Halo.m4a": BARE }, [halo()]);
    expect(only()).toHaveLength(1);

    const result = await covers.fixMissing(signal());
    expect(result).toEqual({ fixed: 1, skipped: [] });

    const { common, format } = await parseFile(join(srv.musicDir, "Beyoncé/Halo.m4a"), { duration: true });
    expect(common.picture).toHaveLength(1);
    expect([common.title, common.artist]).toEqual(["Halo", "Beyoncé"]);
    expect(format.duration).toBeCloseTo(3, 0);
    expect(only()).toHaveLength(0);
    expect(urls[0]).toBe("https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg");
    // Nothing left behind next to the music.
    expect(Bun.spawnSync(["ls", "-A", join(srv.musicDir, "Beyoncé")]).stdout.toString().trim()).toBe("Halo.m4a");
  });

  test("falls back to a smaller thumbnail", async () => {
    const covers = await setup({ "Beyoncé/Halo.m4a": BARE }, [halo()], (url) => (url.includes("maxres") ? null : COVER));
    expect((await covers.fixMissing(signal()))?.fixed).toBe(1);
    expect(urls.map((u) => u.split("/").pop())).toEqual(["maxresdefault.jpg", "hq720.jpg"]);
  });

  test("leaves a track alone when YouTube Music has no matching song", async () => {
    const covers = await setup({ "Beyoncé/Halo.m4a": BARE }, [halo({ title: "Halo (Live)", durationMs: 3000 }), halo({ artists: ["Someone Else"] }), halo({ durationMs: 200_000 })]);
    const result = await covers.fixMissing(signal());
    expect(result).toEqual({ fixed: 0, skipped: [{ title: "Halo", artist: "Beyoncé", reason: "no matching song on YouTube Music" }] });
    expect(urls).toEqual([]);
    expect(only()).toHaveLength(1);
  });

  test("reports a song with no thumbnail, and formats that cannot hold a cover", async () => {
    const covers = await setup({ "Beyoncé/Halo.m4a": BARE, "Beyoncé/Halo2.wav": wav({ title: "Halo", artist: "Beyoncé" }) }, [halo()], () => null);
    const result = await covers.fixMissing(signal());
    expect(result!.fixed).toBe(0);
    expect(result!.skipped.map((s) => s.reason).sort()).toEqual([".wav files cannot hold a cover", "YouTube Music has no cover for it"]);
  });

  test("prefers the release with the file's own album", async () => {
    const covers = await setup({ "Beyoncé/Halo.m4a": BARE }, [halo({ videoId: "single000001", album: "Halo - Single" }), halo({ videoId: "iam00000002", album: "I Am... Sasha Fierce" })]);
    srv.ctx.db.sql.run("UPDATE tracks SET album = 'I Am… Sasha Fierce'");
    await covers.fixMissing(signal());
    expect(urls[0]).toContain("iam00000002");
  });

  test("replaces the cover of a named track, and leaves covered tracks alone otherwise", async () => {
    const covers = await setup({ "Beyoncé/Halo.m4a": asset("halo.m4a") }, [halo()]);
    expect(only()).toHaveLength(0);
    expect(await covers.fixMissing(signal())).toEqual({ fixed: 0, skipped: [] });
    expect(urls).toEqual([]);

    const [track] = srv.ctx.lib.listTracks({ limit: 1, offset: 0 }).items;
    expect(await covers.fixMissing(signal(), [track!.id])).toEqual({ fixed: 1, skipped: [] });
    expect(urls).toHaveLength(1);
    const { common } = await parseFile(join(srv.musicDir, "Beyoncé/Halo.m4a"));
    expect(common.picture).toHaveLength(1);
  });

  test("does not run twice at once", async () => {
    const covers = await setup({ "Beyoncé/Halo.m4a": BARE }, [halo()]);
    const [a, b] = await Promise.all([covers.fixMissing(signal()), covers.fixMissing(signal())]);
    expect([a, b].filter((r) => r === null)).toHaveLength(1);
  });
});
