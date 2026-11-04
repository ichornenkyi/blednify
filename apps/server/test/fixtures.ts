/** Programmatic audio/image fixtures + a throwaway server instance. No binary fixtures are committed. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
import { createApp, createContext, type AppContext } from "../src/app";
import { loadConfig } from "../src/config";

export type Tags = {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  track?: number;
  disc?: number;
  year?: number;
  genre?: string;
  picture?: Uint8Array; // PNG
};

const u32le = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const synchsafe = (n: number) => Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);

function id3Frame(id: string, data: Buffer): Buffer {
  return Buffer.concat([Buffer.from(id, "latin1"), synchsafe(data.length), Buffer.alloc(2), data]);
}
const textFrame = (id: string, text: string) => id3Frame(id, Buffer.concat([Buffer.from([3]), Buffer.from(text, "utf8")]));

/** ID3v2.4 tag (UTF-8 text frames, optional APIC). */
export function id3v24(tags: Tags): Buffer {
  const frames: Buffer[] = [];
  if (tags.title) frames.push(textFrame("TIT2", tags.title));
  if (tags.artist) frames.push(textFrame("TPE1", tags.artist));
  if (tags.album) frames.push(textFrame("TALB", tags.album));
  if (tags.albumArtist) frames.push(textFrame("TPE2", tags.albumArtist));
  if (tags.track) frames.push(textFrame("TRCK", String(tags.track)));
  if (tags.disc) frames.push(textFrame("TPOS", String(tags.disc)));
  if (tags.year) frames.push(textFrame("TDRC", String(tags.year)));
  if (tags.genre) frames.push(textFrame("TCON", tags.genre));
  if (tags.picture) {
    const head = Buffer.concat([Buffer.from([0]), Buffer.from("image/png\0", "latin1"), Buffer.from([3, 0])]);
    frames.push(id3Frame("APIC", Buffer.concat([head, tags.picture])));
  }
  const body = Buffer.concat(frames);
  return Buffer.concat([Buffer.from("ID3", "latin1"), Buffer.from([4, 0, 0]), synchsafe(body.length), body]);
}

function chunk(id: string, data: Buffer): Buffer {
  const pad = data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([Buffer.from(id, "latin1"), u32le(data.length), data, pad]);
}

/** 8 kHz mono 16-bit PCM sine WAV with an embedded `id3 ` chunk. */
export function wav(tags: Tags = {}, durationMs = 250, freq = 440): Buffer {
  const rate = 8000;
  const samples = Math.round((rate * durationMs) / 1000);
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 8000), i * 2);
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0); // PCM
  fmt.writeUInt16LE(1, 2); // mono
  fmt.writeUInt32LE(rate, 4);
  fmt.writeUInt32LE(rate * 2, 8);
  fmt.writeUInt16LE(2, 12);
  fmt.writeUInt16LE(16, 14);
  const chunks = [chunk("fmt ", fmt), chunk("data", pcm)];
  if (Object.keys(tags).length) chunks.push(chunk("id3 ", id3v24(tags)));
  const body = Buffer.concat([Buffer.from("WAVE", "latin1"), ...chunks]);
  return Buffer.concat([Buffer.from("RIFF", "latin1"), u32le(body.length), body]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Solid-colour RGB PNG of `size`×`size`. */
export function png(size = 600, rgb: [number, number, number] = [200, 30, 60]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit, truecolour
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export type TestServer = {
  musicDir: string;
  dataDir: string;
  ctx: AppContext;
  app: ReturnType<typeof createApp>;
  write(rel: string, data: Buffer): string;
  close(): void;
};

/** Fresh temp MUSIC_DIR/DATA_DIR with the given files, plus an app instance (not yet scanned). */
export function testServer(files: Record<string, Buffer> = {}, env: Record<string, string> = {}): TestServer {
  const root = mkdtempSync(join(tmpdir(), "blednify-test-"));
  const musicDir = join(root, "music");
  const dataDir = join(root, "data");
  const write = (rel: string, data: Buffer) => {
    const abs = join(musicDir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, data);
    return abs;
  };
  for (const [rel, data] of Object.entries(files)) write(rel, data);
  const config = loadConfig({ MUSIC_DIR: musicDir, DATA_DIR: dataDir, NODE_ENV: "test", ...env });
  const ctx = createContext(config);
  const app = createApp(ctx);
  return {
    musicDir,
    dataDir,
    ctx,
    app,
    write,
    close() {
      ctx.db.sql.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
