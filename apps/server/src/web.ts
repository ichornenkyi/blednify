import { resolve, sep } from "node:path";
import type { Hono } from "hono";
import { serveFile } from "./serve-file";

const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "no-cache";

/** Serves the exported web app from `webDir`; unknown extensionless paths get index.html (client-side routes). */
export function mountWebApp(app: Hono, webDir: string): void {
  const root = resolve(webDir);
  const send = (req: Request, path: string, cacheControl: string) =>
    serveFile(req, { path, contentType: Bun.file(path).type, cacheControl, etagKey: "web" });

  app.get("*", async (c, next) => {
    const reqPath = c.req.path;
    if (reqPath === "/api" || reqPath.startsWith("/api/")) return next();
    let decoded: string;
    try {
      decoded = decodeURIComponent(reqPath);
    } catch {
      return next();
    }
    const path = resolve(root, `.${decoded}`);
    const inside = path.startsWith(root + sep);
    const hidden = decoded.split("/").some((s) => s.startsWith("."));
    if (inside && !hidden && (await Bun.file(path).exists())) {
      const res = await send(c.req.raw, path, reqPath.startsWith("/_expo/static/") ? IMMUTABLE : REVALIDATE);
      if (res) return res;
    }
    if (decoded.split("/").pop()?.includes(".")) return next();
    return (await send(c.req.raw, resolve(root, "index.html"), REVALIDATE)) ?? next();
  });
}
