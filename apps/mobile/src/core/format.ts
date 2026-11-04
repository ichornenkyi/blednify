const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** `3:07`, `1:02:03`. */
export function formatDuration(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** `512 B`, `3.4 MB`, `12 GB`. */
export function formatBytes(n: number): string {
  let v = Number.isFinite(n) && n > 0 ? n : 0;
  let u = 0;
  while (v >= 1024 && u < UNITS.length - 1) {
    v /= 1024;
    u++;
  }
  const digits = u === 0 || v >= 10 ? 0 : 1;
  return `${v.toFixed(digits)} ${UNITS[u]}`;
}
