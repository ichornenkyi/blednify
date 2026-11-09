import { afterAll, describe, expect, test } from "bun:test";
import { GOOD_MATCH, MIN_MATCH, score } from "../src/imports/match";
import { imageDemuxer } from "../src/imports/importer";
import { LinkError, parseLink, splitVideoTitle } from "../src/imports/sources";
import { testServer } from "./fixtures";

describe("parseLink", () => {
  test("spotify links and uris", async () => {
    expect(await parseLink("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc")).toEqual({
      kind: "spotify",
      type: "playlist",
      id: "37i9dQZF1DXcBWIGoYBM5M",
    });
    expect(await parseLink("open.spotify.com/intl-de/album/4aawyAB9vmqN3uQ7FjRGTy")).toEqual({
      kind: "spotify",
      type: "album",
      id: "4aawyAB9vmqN3uQ7FjRGTy",
    });
    expect(await parseLink("spotify:track:7bxaFZ1O3cHkgLKMsdC3xR")).toEqual({ kind: "spotify", type: "track", id: "7bxaFZ1O3cHkgLKMsdC3xR" });
  });

  test("soundcloud and youtube", async () => {
    expect(await parseLink("https://m.soundcloud.com/lofi_girl/sets/chill-guitar?utm_source=x")).toEqual({
      kind: "soundcloud",
      url: "https://soundcloud.com/lofi_girl/sets/chill-guitar",
    });
    expect((await parseLink("https://music.youtube.com/playlist?list=PL123")).kind).toBe("youtube");
  });

  test("rejects other links", async () => {
    await expect(parseLink("https://example.com/playlist/1")).rejects.toBeInstanceOf(LinkError);
    await expect(parseLink("https://open.spotify.com/artist/5INjqkS1o8h1imAzPqGZBb")).rejects.toBeInstanceOf(LinkError);
    await expect(parseLink("https://soundcloud.com/lofi_girl")).rejects.toBeInstanceOf(LinkError);
    await expect(parseLink("ftp://open.spotify.com/track/x")).rejects.toBeInstanceOf(LinkError);
  });
});

describe("match score", () => {
  const want = { title: "Loser", artists: ["Tame Impala"], durationMs: 223_069 };
  test("official audio is a good match", () => {
    expect(score(want, { title: "Loser", artists: ["Tame Impala"], durationSec: 223 })).toBeGreaterThanOrEqual(GOOD_MATCH);
  });
  test("other versions and lengths lose", () => {
    expect(score(want, { title: "Loser (slowed to perfection)", artists: ["Someone"], durationSec: 290 })).toBeLessThan(MIN_MATCH);
    expect(score(want, { title: "Loser", artists: ["Beck"], durationSec: 235 })).toBeLessThan(GOOD_MATCH);
  });
  test("feat. suffixes do not hurt", () => {
    const w = { title: "Feel This Moment (feat. Christina Aguilera)", artists: ["Pitbull", "Christina Aguilera"], durationMs: 229_000 };
    expect(score(w, { title: "Feel This Moment", artists: ["Pitbull", "Christina Aguilera"], durationSec: 230 })).toBeGreaterThanOrEqual(GOOD_MATCH);
  });
  test("unknown duration still matches on title + artist", () => {
    expect(score({ ...want, durationMs: null }, { title: "Loser", artists: ["Tame Impala"], durationSec: 223 })).toBeGreaterThanOrEqual(GOOD_MATCH);
  });
});

test("splitVideoTitle", () => {
  expect(splitVideoTitle("Tame Impala - Loser (Official Video)")).toEqual({ artist: "Tame Impala", title: "Loser" });
  expect(splitVideoTitle("Just A Title")).toEqual({ artist: null, title: "Just A Title" });
});

describe("routes without yt-dlp", () => {
  const srv = testServer({}, { YTDLP_PATH: "/nonexistent/yt-dlp" });
  afterAll(() => srv.close());
  const post = (path: string, body?: unknown) =>
    srv.app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

  test("admin check reports imports unavailable", async () => {
    expect(((await (await post("/api/admin/check")).json()) as { imports: boolean }).imports).toBe(false);
  });
  test("starting an import explains why it cannot", async () => {
    const res = await post("/api/imports", { url: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M" });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toContain("yt-dlp");
  });
  test("bad bodies and unknown jobs", async () => {
    expect((await post("/api/imports", { nope: 1 })).status).toBe(400);
    expect((await srv.app.request("/api/imports/0123456789abcdef")).status).toBe(404);
    expect((await post("/api/imports/0123456789abcdef/cancel")).status).toBe(404);
    expect(await (await srv.app.request("/api/imports")).json()).toEqual({ items: [] });
  });
});

test("imports need the admin token", async () => {
  const srv = testServer({}, { ADMIN_TOKEN: "secret", ALLOW_OPEN_WRITES: "0" });
  try {
    const res = await srv.app.request("/api/imports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://open.spotify.com/track/7bxaFZ1O3cHkgLKMsdC3xR" }),
    });
    expect(res.status).toBe(401);
  } finally {
    srv.close();
  }
});

test("imageDemuxer accepts only known image formats", () => {
  const b = (...parts: (number[] | string)[]) =>
    Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p, "latin1") : Buffer.from(p))));
  expect(imageDemuxer(b([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg_pipe");
  expect(imageDemuxer(b([0x89], "PNG\r\n"))).toBe("png_pipe");
  expect(imageDemuxer(b("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toBe("webp_pipe");
  expect(imageDemuxer(b("GIF89a"))).toBe("gif");
  // Playlists and anything else must never reach ffmpeg's format probing.
  expect(imageDemuxer(b("#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n"))).toBeNull();
  expect(imageDemuxer(b("ffconcat version 1.0\n"))).toBeNull();
  expect(imageDemuxer(b(""))).toBeNull();
});
