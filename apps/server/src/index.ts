import { Hono } from "hono";

export const app = new Hono();
app.get("/api/health", (c) => c.json({ ok: true, name: "blednify", version: "0.1.0", trackCount: 0 }));

export default { port: Number(process.env.PORT ?? 8787), fetch: app.fetch };
