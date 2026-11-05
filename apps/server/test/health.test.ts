import { afterAll, expect, test } from "bun:test";
import { testServer, wav } from "./fixtures";

const srv = testServer({ "a.wav": wav({ title: "A" }) });
afterAll(() => srv.close());

test("health", async () => {
  const res = await srv.app.request("/api/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, name: "blednify", version: expect.any(String), authRequired: false, trackCount: 0 });
  await srv.ctx.scanner.scan();
  expect(((await (await srv.app.request("/api/health")).json()) as { trackCount: number }).trackCount).toBe(1);
});
