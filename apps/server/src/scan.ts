/** One-off library scan: `bun run scan` (same env as the server: MUSIC_DIR, DATA_DIR). */
import { createContext } from "./app";
import { loadConfig } from "./config";

const ctx = createContext(loadConfig());
try {
  const result = await ctx.scanner.scan();
  console.log(JSON.stringify(result));
} finally {
  ctx.db.sql.close();
}
