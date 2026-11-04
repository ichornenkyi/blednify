import { expect, test } from "bun:test";
import { app } from "../src/index";

test("health", async () => {
  const res = await app.request("/api/health");
  expect(res.status).toBe(200);
  expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
});
