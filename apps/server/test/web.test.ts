import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testServer } from "./fixtures";

const parent = mkdtempSync(join(tmpdir(), "blednify-web-"));
const webDir = join(parent, "web");
mkdirSync(join(webDir, "_expo/static/js"), { recursive: true });
writeFileSync(join(webDir, "index.html"), "<html>app</html>");
writeFileSync(join(webDir, "manifest.json"), "{}");
writeFileSync(join(webDir, ".secret"), "hidden");
writeFileSync(join(webDir, "_expo/static/js/app.js"), "1");
writeFileSync(join(parent, "outside.txt"), "outside");

const srv = testServer({}, { WEB_DIR: webDir });
const api = testServer({});
afterAll(() => {
  srv.close();
  api.close();
  rmSync(parent, { recursive: true, force: true });
});

test("serves the app at / and client-side routes", async () => {
  for (const path of ["/", "/album/abc", "/settings"]) {
    const res = await srv.app.request(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toBe("<html>app</html>");
  }
});

test("static files: hashed bundles are immutable", async () => {
  expect((await srv.app.request("/manifest.json")).status).toBe(200);
  const res = await srv.app.request("/_expo/static/js/app.js");
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toContain("immutable");
});

test("missing files are 404, not index.html", async () => {
  expect((await srv.app.request("/missing.js")).status).toBe(404);
});

test("the API is unaffected and unknown API paths stay JSON 404s", async () => {
  expect((await srv.app.request("/api/health")).status).toBe(200);
  const res = await srv.app.request("/api/nope");
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "not found" });
});

test("cannot escape the web folder or read dotfiles", async () => {
  for (const path of ["/%2e%2e/outside.txt", "/..%2foutside.txt", "/.secret"]) {
    const res = await srv.app.request(path);
    expect(await res.text()).not.toMatch(/outside|hidden/);
  }
});

test("without WEB_DIR nothing is served at /", async () => {
  expect((await api.app.request("/")).status).toBe(404);
});
