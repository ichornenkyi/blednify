/** Runs a command without a shell. Never throws on a non-zero exit; throws only when it cannot start. */
export async function run(
  cmd: string[],
  opts: { signal?: AbortSignal; timeoutMs?: number; cwd?: string } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", stdin: "ignore", cwd: opts.cwd });
  const kill = () => proc.kill("SIGKILL");
  opts.signal?.addEventListener("abort", kill, { once: true });
  const timer = setTimeout(kill, opts.timeoutMs ?? 10 * 60_000);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { code, stdout, stderr };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", kill);
  }
}

/** True when `cmd --version` runs. */
export async function available(cmd: string): Promise<boolean> {
  try {
    return (await run([cmd, cmd.endsWith("ffmpeg") || cmd.endsWith("ffprobe") ? "-version" : "--version"], { timeoutMs: 15_000 }))
      .code === 0;
  } catch {
    return false;
  }
}

/** Last meaningful `ERROR:` line from yt-dlp / ffmpeg stderr, without the noise. */
export function errorLine(stderr: string, fallback: string): string {
  const lines = stderr.split("\n").map((l) => l.trim()).filter(Boolean);
  const err = [...lines].reverse().find((l) => /^ERROR:/i.test(l)) ?? lines.at(-1);
  return (err ?? fallback).replace(/^ERROR:\s*/i, "").replace(/^\[[^\]]+\]\s*/, "").slice(0, 300) || fallback;
}
