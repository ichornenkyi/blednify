import { createApp, createContext, VERSION } from "./app";
import { loadConfig } from "./config";

export { createApp, createContext } from "./app";

if (import.meta.main) {
  const config = loadConfig();
  const ctx = createContext(config);
  const app = createApp(ctx);

  const server = Bun.serve({
    port: config.port,
    fetch: app.fetch,
    // Hard backstop only: the upload route's bodyLimit enforces MAX_UPLOAD_MB with a JSON 413.
    maxRequestBodySize: config.maxUploadBytes * 4,
    idleTimeout: 60,
  });

  console.log(
    `blednify-server ${VERSION} on http://${server.hostname}:${server.port}` +
      ` · music ${config.musicDir} · data ${config.dataDir}` +
      ` · writes ${config.adminToken ? "require ADMIN_TOKEN" : config.allowOpenWrites ? "OPEN (ALLOW_OPEN_WRITES)" : "disabled (no ADMIN_TOKEN)"}` +
      ` · search ${ctx.db.fts ? "fts5" : "like"}` +
      ` · music import ${config.jackettUrl && config.jackettApiKey && config.torrServerUrl ? "on" : "off"}`,
  );

  // Answer requests immediately; index in the background.
  setTimeout(() => ctx.scanner.scan().catch((err) => console.error("[scan] failed:", err)), 0);

  const shutdown = (signal: string) => {
    console.log(`${signal}: shutting down`);
    // Let in-flight requests finish, but don't let a long-lived audio stream hold shutdown hostage.
    setTimeout(() => process.exit(0), 5000).unref();
    void server.stop().finally(() => {
      ctx.db.sql.close();
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
