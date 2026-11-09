import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { testServer, wav, type TestServer } from "./fixtures";

const TOKEN = "listen-secret-123";
let srv: TestServer;
const auth = { Authorization: `Bearer ${TOKEN}` };

beforeAll(async () => {
  srv = testServer({ "Artist/Album/01 - Song.wav": wav({ title: "Song", artist: "Artist", album: "Album" }, 2000) }, { LISTEN_TOKEN: TOKEN });
  await srv.ctx.scanner.scan();
});
afterAll(() => srv.close());

const get = (path: string, headers: Record<string, string> = {}) => srv.app.request(path, { headers });
const trackId = async () => ((await (await get("/api/tracks", auth)).json()) as { items: { id: string }[] }).items[0]!.id;

describe("listen token", () => {
  test("health without a token reveals no track count", async () => {
    const res = await get("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, name: "blednify", version: expect.any(String), authRequired: true });
  });

  test("health with the right token returns the track count", async () => {
    const body = (await (await get("/api/health", auth)).json()) as { authRequired: boolean; trackCount: number };
    expect(body.authRequired).toBe(true);
    expect(body.trackCount).toBe(1);
  });

  test("health with a wrong token is 401, not a silent downgrade", async () => {
    const res = await get("/api/health", { Authorization: "Bearer nope" });
    expect(res.status).toBe(401);
  });

  test("every library read needs the token", async () => {
    const id = await trackId();
    for (const path of ["/api/tracks", `/api/tracks/${id}`, `/api/tracks/${id}/stream`, `/api/tracks/${id}/artwork`, "/api/albums", "/api/artists", "/api/search?q=song"]) {
      expect({ path, status: (await get(path)).status }).toEqual({ path, status: 401 });
      expect({ path, status: (await get(path, { Authorization: "Bearer wrong" })).status }).toEqual({ path, status: 401 });
    }
  });

  test("with the token, streaming still supports ranges and is marked private for shared caches", async () => {
    const id = await trackId();
    const full = await get(`/api/tracks/${id}/stream`, auth);
    expect(full.status).toBe(200);
    expect(full.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    const part = await get(`/api/tracks/${id}/stream`, { ...auth, Range: "bytes=0-99" });
    expect(part.status).toBe(206);
    expect((await part.arrayBuffer()).byteLength).toBe(100);
  });

  test("writes need ADMIN_TOKEN; the listen token does not grant them", async () => {
    const admin = testServer({}, { LISTEN_TOKEN: TOKEN, ADMIN_TOKEN: "admin-xyz", ALLOW_OPEN_WRITES: "" });
    try {
      const withListen = await admin.app.request("/api/rescan", { method: "POST", headers: auth });
      expect(withListen.status).toBe(401);
      const withAdmin = await admin.app.request("/api/rescan", { method: "POST", headers: { Authorization: "Bearer admin-xyz" } });
      expect(withAdmin.status).toBe(200);
    } finally {
      admin.close();
    }
  });
});

describe("web session cookie", () => {
  const cookieFrom = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0]!;

  test("POST /api/session needs the listen token", async () => {
    expect((await srv.app.request("/api/session", { method: "POST" })).status).toBe(401);
    expect((await srv.app.request("/api/session", { method: "POST", headers: { Authorization: "Bearer nope" } })).status).toBe(401);
  });

  test("the cookie authorises reads (media elements cannot send headers)", async () => {
    const res = await srv.app.request("/api/session", { method: "POST", headers: auth });
    expect(res.status).toBe(204);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/api");
    expect(setCookie).not.toContain("Secure");
    const cookie = cookieFrom(res);
    const id = await trackId();
    expect((await get(`/api/tracks/${id}/stream`, { Cookie: cookie })).status).toBe(200);
    expect((await get("/api/tracks", { Cookie: cookie })).status).toBe(200);
    const health = (await (await get("/api/health", { Cookie: cookie })).json()) as { trackCount?: number };
    expect(health.trackCount).toBe(1);
  });

  test("a wrong cookie is refused", async () => {
    expect((await get("/api/tracks", { Cookie: "blednify_listen=nope" })).status).toBe(401);
  });

  test("the cookie is Secure behind an https proxy, and DELETE clears it", async () => {
    const res = await srv.app.request("/api/session", { method: "POST", headers: { ...auth, "X-Forwarded-Proto": "https" } });
    expect(res.headers.get("set-cookie")).toContain("Secure");
    const del = await srv.app.request("/api/session", { method: "DELETE" });
    expect(del.status).toBe(204);
    expect(del.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
