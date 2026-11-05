import { getDb } from './db';
import { libIndex } from './lib-index';

let loading: Promise<void> | null = null;

export function loadLibIndex(): Promise<void> {
  loading ??= (async () => {
    const db = await getDb();
    const [likes, downloads] = await Promise.all([
      db.getAllAsync<{ key: string }>('SELECT key FROM likes'),
      db.getAllAsync<{ key: string; file: string; art: string | null; size_bytes: number }>(
        'SELECT key, file, art, size_bytes FROM downloads',
      ),
    ]);
    libIndex.setState({
      ready: true,
      liked: new Set(likes.map((r) => r.key)),
      downloads: new Map(downloads.map((r) => [r.key, { file: r.file, art: r.art, size: r.size_bytes }])),
    });
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}
