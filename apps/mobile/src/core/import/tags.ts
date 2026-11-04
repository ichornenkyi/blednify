/**
 * Compact, dependency-free audio tag reader (Hermes-safe; no Buffer/TextDecoder required).
 * Supports ID3v2.2–2.4 + ID3v1 (MP3), FLAC (Vorbis comments + PICTURE), Ogg Vorbis/Opus,
 * MP4/M4A (iTunes ilst) and WAV (RIFF INFO). Also derives duration from stream headers.
 */

export type Picture = { data: Uint8Array; mime: string };

export type Tags = {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  trackNumber?: number;
  discNumber?: number;
  year?: number;
  genre?: string;
  durationMs?: number;
  picture?: Picture;
};

/** Random-access byte source. Reads past EOF are truncated. */
export interface ByteReader {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

const MAX_PICTURE = 8 << 20;
const MAX_BOX = 24 << 20;

// --- Binary helpers --------------------------------------------------------------------------

const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u24be = (b: Uint8Array, o: number) => (b[o] << 16) | (b[o + 1] << 8) | b[o + 2];
const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32le = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u64le = (b: Uint8Array, o: number) => u32le(b, o) + u32le(b, o + 4) * 2 ** 32;
const u64be = (b: Uint8Array, o: number) => u32be(b, o) * 2 ** 32 + u32be(b, o + 4);
const synchsafe = (b: Uint8Array, o: number) =>
  ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);

function ascii(b: Uint8Array, s: number, e: number): string {
  let out = '';
  for (let i = s; i < e && i < b.length; i++) out += String.fromCharCode(b[i]);
  return out;
}

const is = (b: Uint8Array, o: number, sig: string) => o + sig.length <= b.length && ascii(b, o, o + sig.length) === sig;

function utf8(b: Uint8Array, s = 0, e = b.length): string {
  const codes: number[] = [];
  let i = s;
  while (i < e) {
    const c = b[i++];
    if (c < 0x80) codes.push(c);
    else if (c >= 0xc0 && c < 0xe0 && i < e) codes.push(((c & 0x1f) << 6) | (b[i++] & 0x3f));
    else if (c >= 0xe0 && c < 0xf0 && i + 1 < e) {
      codes.push(((c & 0x0f) << 12) | ((b[i] & 0x3f) << 6) | (b[i + 1] & 0x3f));
      i += 2;
    } else if (c >= 0xf0 && i + 2 < e) {
      const cp = (((c & 0x07) << 18) | ((b[i] & 0x3f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f)) - 0x10000;
      i += 3;
      codes.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else codes.push(0xfffd);
  }
  return fromCodes(codes);
}

function utf16(b: Uint8Array, s: number, e: number, le: boolean): string {
  const codes: number[] = [];
  for (let i = s; i + 1 < e; i += 2) codes.push(le ? u16le(b, i) : u16be(b, i));
  return fromCodes(codes);
}

function fromCodes(codes: number[]): string {
  let out = '';
  for (let i = 0; i < codes.length; i += 4096) out += String.fromCharCode(...codes.slice(i, i + 4096));
  return out;
}

const clean = (s: string | undefined): string | undefined => {
  const v = s?.replace(/\0/g, '').trim();
  return v ? v : undefined;
};

const firstInt = (s: string | undefined): number | undefined => {
  const m = s?.match(/\d+/);
  const n = m ? parseInt(m[0], 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const yearOf = (s: string | undefined): number | undefined => {
  const m = s?.match(/\b(\d{4})\b/);
  const n = m ? parseInt(m[1], 10) : NaN;
  return n >= 1000 && n <= 9999 ? n : undefined;
};

function pictureMime(data: Uint8Array, declared?: string): string {
  if (data[0] === 0x89 && data[1] === 0x50) return 'image/png';
  if (data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg';
  if (is(data, 0, 'RIFF') && is(data, 8, 'WEBP')) return 'image/webp';
  return declared && declared.includes('/') ? declared.toLowerCase() : 'image/jpeg';
}

function setIfMissing<K extends keyof Tags>(tags: Tags, key: K, value: Tags[K] | undefined) {
  if (value !== undefined && tags[key] === undefined) tags[key] = value;
}

function merge(primary: Tags, fallback: Tags): Tags {
  const out: Tags = { ...primary };
  for (const k of Object.keys(fallback) as (keyof Tags)[]) setIfMissing(out, k, fallback[k] as never);
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64Decode(s: string): Uint8Array {
  const clean64 = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean64.length * 3) / 4));
  let o = 0;
  for (let i = 0; i + 1 < clean64.length; i += 4) {
    const a = B64.indexOf(clean64[i]);
    const b = B64.indexOf(clean64[i + 1]);
    const c = i + 2 < clean64.length ? B64.indexOf(clean64[i + 2]) : -1;
    const d = i + 3 < clean64.length ? B64.indexOf(clean64[i + 3]) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

// ID3v1 genre list (0–79 standard + common Winamp extensions).
const GENRES = (
  'Blues|Classic Rock|Country|Dance|Disco|Funk|Grunge|Hip-Hop|Jazz|Metal|New Age|Oldies|Other|Pop|R&B|Rap|' +
  'Reggae|Rock|Techno|Industrial|Alternative|Ska|Death Metal|Pranks|Soundtrack|Euro-Techno|Ambient|Trip-Hop|' +
  'Vocal|Jazz+Funk|Fusion|Trance|Classical|Instrumental|Acid|House|Game|Sound Clip|Gospel|Noise|AlternRock|' +
  'Bass|Soul|Punk|Space|Meditative|Instrumental Pop|Instrumental Rock|Ethnic|Gothic|Darkwave|' +
  'Techno-Industrial|Electronic|Pop-Folk|Eurodance|Dream|Southern Rock|Comedy|Cult|Gangsta|Top 40|' +
  'Christian Rap|Pop/Funk|Jungle|Native American|Cabaret|New Wave|Psychadelic|Rave|Showtunes|Trailer|Lo-Fi|' +
  'Tribal|Acid Punk|Acid Jazz|Polka|Retro|Musical|Rock & Roll|Hard Rock|Folk|Folk-Rock|National Folk|Swing|' +
  'Fast Fusion|Bebob|Latin|Revival|Celtic|Bluegrass|Avantgarde|Gothic Rock|Progressive Rock|' +
  'Psychedelic Rock|Symphonic Rock|Slow Rock|Big Band|Chorus|Easy Listening|Acoustic|Humour|Speech|Chanson|' +
  'Opera|Chamber Music|Sonata|Symphony|Booty Bass|Primus|Porn Groove|Satire|Slow Jam|Club|Tango|Samba|' +
  'Folklore|Ballad|Power Ballad|Rhythmic Soul|Freestyle|Duet|Punk Rock|Drum Solo|A capella|Euro-House|' +
  'Dance Hall'
).split('|');

function genreName(raw: string | undefined): string | undefined {
  const v = clean(raw);
  if (!v) return undefined;
  const m = v.match(/^\((\d+)\)(.*)$/) ?? v.match(/^(\d+)()$/);
  if (m) return clean(m[2]) ?? GENRES[parseInt(m[1], 10)] ?? undefined;
  return v;
}

// --- Entry point -----------------------------------------------------------------------------

export async function readTags(r: ByteReader): Promise<Tags> {
  if (r.size < 16) return {};
  const head = await r.read(0, Math.min(r.size, 64 * 1024));
  if (is(head, 0, 'ID3') || isMpegSync(head, 0)) return readMpeg(r, head);
  if (is(head, 0, 'fLaC')) return readFlac(r, 4);
  if (is(head, 0, 'OggS')) return readOgg(r);
  if (is(head, 4, 'ftyp')) return readMp4(r);
  if (is(head, 0, 'RIFF') && is(head, 8, 'WAVE')) return readWav(r);
  return readId3v1(r);
}

// --- ID3v2 / MPEG ----------------------------------------------------------------------------

function unsync(b: Uint8Array): Uint8Array {
  const out = new Uint8Array(b.length);
  let o = 0;
  for (let i = 0; i < b.length; i++) {
    out[o++] = b[i];
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return out.subarray(0, o);
}

/** Decode ID3 text with encoding byte; returns the first null-separated value. */
function id3Text(enc: number, b: Uint8Array, s: number, e: number): string | undefined {
  let text: string;
  if (enc === 1 || enc === 2) {
    let le = enc === 1;
    if (enc === 1 && b[s] === 0xfe && b[s + 1] === 0xff) {
      le = false;
      s += 2;
    } else if (enc === 1 && b[s] === 0xff && b[s + 1] === 0xfe) s += 2;
    text = utf16(b, s, e, le);
  } else text = enc === 3 ? utf8(b, s, e) : ascii(b, s, e);
  return clean(text.split('\0')[0]);
}

/** End index (exclusive of terminator) of a null-terminated string in the given encoding. */
function termEnd(enc: number, b: Uint8Array, s: number): [end: number, next: number] {
  if (enc === 1 || enc === 2) {
    for (let i = s; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return [i, i + 2];
    return [b.length, b.length];
  }
  const i = b.indexOf(0, s);
  return i < 0 ? [b.length, b.length] : [i, i + 1];
}

const ID3_TEXT: Record<string, 'title' | 'artist' | 'albumArtist' | 'album'> = {
  TIT2: 'title',
  TT2: 'title',
  TPE1: 'artist',
  TP1: 'artist',
  TPE2: 'albumArtist',
  TP2: 'albumArtist',
  TALB: 'album',
  TAL: 'album',
};

function applyId3Frame(tags: Tags, id: string, d: Uint8Array, front: { isFront: boolean }) {
  if (!d.length) return;
  const text = () => id3Text(d[0], d, 1, d.length);
  const key = ID3_TEXT[id];
  if (key) return setIfMissing(tags, key, text());
  switch (id) {
    case 'TRCK':
    case 'TRK':
      return setIfMissing(tags, 'trackNumber', firstInt(text()));
    case 'TPOS':
    case 'TPA':
      return setIfMissing(tags, 'discNumber', firstInt(text()));
    case 'TDRC':
    case 'TYER':
    case 'TYE':
    case 'TDOR':
    case 'TORY':
      return setIfMissing(tags, 'year', yearOf(text()));
    case 'TCON':
    case 'TCO':
      return setIfMissing(tags, 'genre', genreName(text()));
    case 'TLEN':
    case 'TLE': {
      const ms = firstInt(text());
      return setIfMissing(tags, 'durationMs', ms && ms > 1000 ? ms : undefined);
    }
    case 'APIC':
    case 'PIC': {
      const enc = d[0];
      let mime: string | undefined;
      let p: number;
      if (id === 'APIC') {
        const [mEnd, mNext] = termEnd(0, d, 1);
        mime = ascii(d, 1, mEnd);
        p = mNext;
      } else {
        mime = ascii(d, 1, 4).toLowerCase() === 'png' ? 'image/png' : 'image/jpeg';
        p = 4;
      }
      const type = d[p];
      const [, next] = termEnd(enc, d, p + 1);
      const data = d.subarray(next);
      if (!data.length || data.length > MAX_PICTURE) return;
      if (!tags.picture || (type === 3 && !front.isFront)) {
        tags.picture = { data: data.slice(), mime: pictureMime(data, mime) };
        front.isFront = type === 3;
      }
      return;
    }
  }
}

async function readId3v2(r: ByteReader, head: Uint8Array): Promise<{ tags: Tags; end: number }> {
  const ver = head[3];
  const flags = head[5];
  const size = synchsafe(head, 6);
  const end = 10 + size + (flags & 0x10 ? 10 : 0);
  const tags: Tags = {};
  if (ver < 2 || ver > 4 || size > MAX_BOX) return { tags, end };
  const raw = 10 + size <= head.length ? head : await r.read(0, 10 + size);
  let body = raw.subarray(10, 10 + size);
  if (ver < 4 && flags & 0x80) body = unsync(body);
  let p = 0;
  if (flags & 0x40) p = ver === 3 ? 4 + u32be(body, 0) : ver === 4 ? synchsafe(body, 0) : 0;
  const idLen = ver === 2 ? 3 : 4;
  const hdr = ver === 2 ? 6 : 10;
  const front = { isFront: false };
  while (p + hdr <= body.length) {
    if (body[p] === 0) break; // padding
    const id = ascii(body, p, p + idLen);
    if (!/^[A-Z0-9]+$/.test(id)) break;
    const fsize = ver === 2 ? u24be(body, p + 3) : ver === 4 ? synchsafe(body, p + 4) : u32be(body, p + 4);
    const fflags = ver === 2 ? 0 : body[p + 9];
    let d = body.subarray(p + hdr, Math.min(body.length, p + hdr + fsize));
    p += hdr + fsize;
    if (ver === 3) {
      if (fflags & 0xc0) continue; // compressed / encrypted
      if (fflags & 0x20) d = d.subarray(1);
    } else if (ver === 4) {
      if (fflags & 0x0c) continue;
      if (fflags & 0x40) d = d.subarray(1);
      if (fflags & 0x01) d = d.subarray(4);
      if (fflags & 0x02) d = unsync(d);
    }
    applyId3Frame(tags, id, d, front);
  }
  return { tags, end };
}

function isMpegSync(b: Uint8Array, i: number): boolean {
  return i + 3 < b.length && b[i] === 0xff && (b[i + 1] & 0xe0) === 0xe0 && parseMpegHeader(b, i) !== null;
}

const BITRATES: Record<string, number[]> = {
  '1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SAMPLE_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

type MpegHeader = { mpeg1: boolean; layer: number; bitrate: number; sampleRate: number; mono: boolean; frameLen: number; spf: number };

function parseMpegHeader(b: Uint8Array, i: number): MpegHeader | null {
  if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null;
  const verBits = (b[i + 1] >> 3) & 3;
  const layerBits = (b[i + 1] >> 1) & 3;
  const brIdx = b[i + 2] >> 4;
  const srIdx = (b[i + 2] >> 2) & 3;
  if (verBits === 1 || layerBits === 0 || brIdx === 0 || brIdx === 15 || srIdx === 3) return null;
  const mpeg1 = verBits === 3;
  const layer = 4 - layerBits;
  const bitrate = BITRATES[mpeg1 ? `1-${layer}` : layer === 1 ? '2-1' : '2-2'][brIdx] * 1000;
  const sampleRate = SAMPLE_RATES[verBits][srIdx];
  const pad = (b[i + 2] >> 1) & 1;
  const spf = layer === 1 ? 384 : layer === 2 || mpeg1 ? 1152 : 576;
  const frameLen = layer === 1 ? (Math.floor((12 * bitrate) / sampleRate) + pad) * 4 : Math.floor((spf / 8) * bitrate / sampleRate) + pad;
  return { mpeg1, layer, bitrate, sampleRate, mono: b[i + 3] >> 6 === 3, frameLen, spf };
}

async function mpegDuration(r: ByteReader, start: number, hasV1: boolean): Promise<number | undefined> {
  const buf = await r.read(start, 64 * 1024);
  for (let i = 0; i + 4 < buf.length; i++) {
    if (buf[i] !== 0xff) continue;
    const h = parseMpegHeader(buf, i);
    if (!h || h.frameLen < 24) continue;
    const n = i + h.frameLen;
    if (n + 1 < buf.length && !(buf[n] === 0xff && (buf[n + 1] & 0xe0) === 0xe0)) continue;
    const xing = i + 4 + (h.mpeg1 ? (h.mono ? 17 : 32) : h.mono ? 9 : 17);
    if ((is(buf, xing, 'Xing') || is(buf, xing, 'Info')) && buf[xing + 7] & 1) {
      const frames = u32be(buf, xing + 8);
      if (frames > 0) return Math.round((frames * h.spf * 1000) / h.sampleRate);
    }
    if (is(buf, i + 36, 'VBRI')) {
      const frames = u32be(buf, i + 36 + 14);
      if (frames > 0) return Math.round((frames * h.spf * 1000) / h.sampleRate);
    }
    const audioBytes = r.size - (start + i) - (hasV1 ? 128 : 0);
    return audioBytes > 0 ? Math.round((audioBytes * 8 * 1000) / h.bitrate) : undefined;
  }
  return undefined;
}

async function readId3v1(r: ByteReader): Promise<Tags> {
  if (r.size < 128) return {};
  const t = await r.read(r.size - 128, 128);
  if (!is(t, 0, 'TAG')) return {};
  const tags: Tags = {
    title: clean(ascii(t, 3, 33)),
    artist: clean(ascii(t, 33, 63)),
    album: clean(ascii(t, 63, 93)),
    year: yearOf(ascii(t, 93, 97)),
    trackNumber: t[125] === 0 && t[126] !== 0 ? t[126] : undefined,
    genre: GENRES[t[127]],
  };
  for (const k of Object.keys(tags) as (keyof Tags)[]) if (tags[k] === undefined) delete tags[k];
  return tags;
}

async function readMpeg(r: ByteReader, head: Uint8Array): Promise<Tags> {
  let tags: Tags = {};
  let start = 0;
  if (is(head, 0, 'ID3')) {
    const res = await readId3v2(r, head);
    tags = res.tags;
    start = res.end;
    const after = await r.read(start, 4);
    if (is(after, 0, 'fLaC')) return merge(tags, await readFlac(r, start + 4));
  }
  const v1 = await readId3v1(r);
  tags = merge(tags, v1);
  if (!tags.durationMs) setIfMissing(tags, 'durationMs', await mpegDuration(r, start, !!Object.keys(v1).length));
  return tags;
}

// --- Vorbis comments / FLAC ------------------------------------------------------------------

function parseFlacPicture(d: Uint8Array): (Picture & { type: number }) | undefined {
  if (d.length < 32) return undefined;
  const type = u32be(d, 0);
  const mimeLen = u32be(d, 4);
  const mime = ascii(d, 8, 8 + mimeLen);
  let p = 8 + mimeLen;
  p += 4 + u32be(d, p); // description
  p += 16; // width, height, depth, colors
  const len = u32be(d, p);
  p += 4;
  if (!len || p + len > d.length || len > MAX_PICTURE) return undefined;
  const data = d.slice(p, p + len);
  return { type, data, mime: pictureMime(data, mime) };
}

function applyPicture(tags: Tags, pic: (Picture & { type: number }) | undefined, front: { isFront: boolean }) {
  if (!pic) return;
  if (!tags.picture || (pic.type === 3 && !front.isFront)) {
    tags.picture = { data: pic.data, mime: pic.mime };
    front.isFront = pic.type === 3;
  }
}

function parseVorbisComment(d: Uint8Array, p: number, tags: Tags, front: { isFront: boolean }) {
  if (p + 8 > d.length) return;
  p += 4 + u32le(d, p); // vendor
  const count = u32le(d, p);
  p += 4;
  for (let i = 0; i < count && p + 4 <= d.length; i++) {
    const len = u32le(d, p);
    p += 4;
    const end = Math.min(d.length, p + len);
    const eq = d.indexOf(0x3d, p); // '='
    if (eq > p && eq < end) {
      const key = ascii(d, p, eq).toUpperCase();
      if (key === 'METADATA_BLOCK_PICTURE') applyPicture(tags, parseFlacPicture(base64Decode(ascii(d, eq + 1, end))), front);
      else {
        const v = clean(utf8(d, eq + 1, end));
        switch (key) {
          case 'TITLE':
            setIfMissing(tags, 'title', v);
            break;
          case 'ARTIST':
            setIfMissing(tags, 'artist', v);
            break;
          case 'ALBUM':
            setIfMissing(tags, 'album', v);
            break;
          case 'ALBUMARTIST':
          case 'ALBUM ARTIST':
            setIfMissing(tags, 'albumArtist', v);
            break;
          case 'TRACKNUMBER':
            setIfMissing(tags, 'trackNumber', firstInt(v));
            break;
          case 'DISCNUMBER':
            setIfMissing(tags, 'discNumber', firstInt(v));
            break;
          case 'DATE':
          case 'YEAR':
          case 'ORIGINALDATE':
            setIfMissing(tags, 'year', yearOf(v));
            break;
          case 'GENRE':
            setIfMissing(tags, 'genre', v);
            break;
        }
      }
    }
    p = end;
  }
}

async function readFlac(r: ByteReader, start: number): Promise<Tags> {
  const tags: Tags = {};
  const front = { isFront: false };
  let p = start;
  for (let last = false; !last && p + 4 <= r.size; ) {
    const h = await r.read(p, 4);
    last = (h[0] & 0x80) !== 0;
    const type = h[0] & 0x7f;
    const len = u24be(h, 1);
    p += 4;
    if (type === 0 || type === 4 || (type === 6 && len <= MAX_PICTURE)) {
      const d = await r.read(p, len);
      if (type === 0 && d.length >= 18) {
        const rate = (d[10] << 12) | (d[11] << 4) | (d[12] >> 4);
        const samples = (d[13] & 0x0f) * 2 ** 32 + u32be(d, 14);
        if (rate > 0 && samples > 0) tags.durationMs = Math.round((samples * 1000) / rate);
      } else if (type === 4) parseVorbisComment(d, 0, tags, front);
      else if (type === 6) applyPicture(tags, parseFlacPicture(d), front);
    }
    p += len;
  }
  return tags;
}

// --- Ogg (Vorbis / Opus) ---------------------------------------------------------------------

async function readOgg(r: ByteReader): Promise<Tags> {
  const packets: Uint8Array[] = [];
  let parts: Uint8Array[] = [];
  let p = 0;
  let serial = -1;
  while (packets.length < 2 && p + 27 <= r.size && p < MAX_BOX) {
    const h = await r.read(p, 27 + 255);
    if (!is(h, 0, 'OggS')) break;
    const nseg = h[26];
    const segs = h.subarray(27, 27 + nseg);
    let bodyLen = 0;
    for (const s of segs) bodyLen += s;
    const pageSerial = u32le(h, 14);
    if (serial < 0) serial = pageSerial;
    const bodyStart = p + 27 + nseg;
    p = bodyStart + bodyLen;
    if (pageSerial !== serial) continue;
    const body = await r.read(bodyStart, bodyLen);
    let q = 0;
    for (const s of segs) {
      parts.push(body.subarray(q, q + s));
      q += s;
      if (s < 255) {
        const total = parts.reduce((n, x) => n + x.length, 0);
        const pkt = new Uint8Array(total);
        let o = 0;
        for (const x of parts) {
          pkt.set(x, o);
          o += x.length;
        }
        packets.push(pkt);
        parts = [];
        if (packets.length === 2) break;
      }
    }
  }
  const tags: Tags = {};
  const front = { isFront: false };
  const [id, comment] = packets;
  if (!id) return tags;
  let rate = 0;
  let preSkip = 0;
  if (id[0] === 1 && is(id, 1, 'vorbis')) {
    rate = u32le(id, 12);
    if (comment && comment[0] === 3 && is(comment, 1, 'vorbis')) parseVorbisComment(comment, 7, tags, front);
  } else if (is(id, 0, 'OpusHead')) {
    rate = 48000;
    preSkip = u16le(id, 10);
    if (comment && is(comment, 0, 'OpusTags')) parseVorbisComment(comment, 8, tags, front);
  }
  if (rate > 0) {
    const tailLen = Math.min(r.size, 64 * 1024);
    const tail = await r.read(r.size - tailLen, tailLen);
    for (let i = tail.length - 27; i >= 0; i--) {
      if (tail[i] === 0x4f && is(tail, i, 'OggS') && u32le(tail, i + 14) === serial) {
        const granule = u64le(tail, i + 6);
        if (granule > preSkip) tags.durationMs = Math.round(((granule - preSkip) * 1000) / rate);
        break;
      }
    }
  }
  return tags;
}

// --- MP4 / M4A -------------------------------------------------------------------------------

type Box = { type: string; start: number; end: number };

function* boxes(b: Uint8Array, s: number, e: number): Generator<Box> {
  let p = s;
  while (p + 8 <= e) {
    let size = u32be(b, p);
    const type = ascii(b, p + 4, p + 8);
    let hdr = 8;
    if (size === 1 && p + 16 <= e) {
      size = u64be(b, p + 8);
      hdr = 16;
    } else if (size === 0) size = e - p;
    if (size < hdr || p + size > e) return;
    yield { type, start: p + hdr, end: p + size };
    p += size;
  }
}

const child = (b: Uint8Array, s: number, e: number, type: string) => {
  for (const x of boxes(b, s, e)) if (x.type === type) return x;
  return undefined;
};

function parseIlst(b: Uint8Array, s: number, e: number, tags: Tags) {
  for (const item of boxes(b, s, e)) {
    const data = child(b, item.start, item.end, 'data');
    if (!data || data.end - data.start < 8) continue;
    const kind = u32be(b, data.start) & 0xffffff;
    const ps = data.start + 8;
    const pe = data.end;
    const text = () => clean(utf8(b, ps, pe));
    switch (item.type) {
      case '©nam':
        setIfMissing(tags, 'title', text());
        break;
      case '©ART':
        setIfMissing(tags, 'artist', text());
        break;
      case 'aART':
        setIfMissing(tags, 'albumArtist', text());
        break;
      case '©alb':
        setIfMissing(tags, 'album', text());
        break;
      case '©day':
        setIfMissing(tags, 'year', yearOf(text()));
        break;
      case '©gen':
        setIfMissing(tags, 'genre', text());
        break;
      case 'gnre':
        if (pe - ps >= 2) setIfMissing(tags, 'genre', GENRES[u16be(b, ps) - 1]);
        break;
      case 'trkn':
        if (pe - ps >= 4) setIfMissing(tags, 'trackNumber', u16be(b, ps + 2) || undefined);
        break;
      case 'disk':
        if (pe - ps >= 4) setIfMissing(tags, 'discNumber', u16be(b, ps + 2) || undefined);
        break;
      case 'covr':
        if (!tags.picture && pe > ps && pe - ps <= MAX_PICTURE) {
          const img = b.slice(ps, pe);
          tags.picture = { data: img, mime: pictureMime(img, kind === 14 ? 'image/png' : 'image/jpeg') };
        }
        break;
    }
  }
}

function parseMoov(m: Uint8Array): Tags {
  const tags: Tags = {};
  for (const box of boxes(m, 0, m.length)) {
    if (box.type === 'mvhd') {
      const v = m[box.start];
      const timescale = v === 1 ? u32be(m, box.start + 20) : u32be(m, box.start + 12);
      const duration = v === 1 ? u64be(m, box.start + 24) : u32be(m, box.start + 16);
      if (timescale > 0 && duration > 0) tags.durationMs = Math.round((duration * 1000) / timescale);
    } else if (box.type === 'udta' || box.type === 'meta') {
      const meta = box.type === 'meta' ? box : child(m, box.start, box.end, 'meta');
      if (!meta) continue;
      // `meta` is a full box in ISO files (4 bytes version/flags) but not in some QuickTime files.
      const s = is(m, meta.start + 4, 'hdlr') ? meta.start : meta.start + 4;
      const ilst = child(m, s, meta.end, 'ilst');
      if (ilst) parseIlst(m, ilst.start, ilst.end, tags);
    }
  }
  return tags;
}

async function readMp4(r: ByteReader): Promise<Tags> {
  let p = 0;
  while (p + 8 <= r.size) {
    const h = await r.read(p, 16);
    let size = u32be(h, 0);
    const type = ascii(h, 4, 8);
    let hdr = 8;
    if (size === 1) {
      size = u64be(h, 8);
      hdr = 16;
    } else if (size === 0) size = r.size - p;
    if (size < hdr) break;
    if (type === 'moov') return size > MAX_BOX ? {} : parseMoov(await r.read(p + hdr, size - hdr));
    p += size;
  }
  return {};
}

// --- WAV -------------------------------------------------------------------------------------

async function readWav(r: ByteReader): Promise<Tags> {
  const tags: Tags = {};
  let p = 12;
  let byteRate = 0;
  let dataSize = 0;
  while (p + 8 <= r.size) {
    const h = await r.read(p, 8);
    const id = ascii(h, 0, 4);
    const size = u32le(h, 4);
    const body = p + 8;
    if (id === 'fmt ') byteRate = u32le(await r.read(body, 16), 8);
    else if (id === 'data') dataSize = Math.min(size, r.size - body);
    else if (id === 'LIST' && size < 1 << 20) {
      const d = await r.read(body, size);
      if (is(d, 0, 'INFO'))
        for (let q = 4; q + 8 <= d.length; ) {
          const sid = ascii(d, q, q + 4);
          const len = u32le(d, q + 4);
          const v = clean(utf8(d, q + 8, Math.min(d.length, q + 8 + len)));
          if (sid === 'INAM') setIfMissing(tags, 'title', v);
          else if (sid === 'IART') setIfMissing(tags, 'artist', v);
          else if (sid === 'IPRD') setIfMissing(tags, 'album', v);
          else if (sid === 'ICRD') setIfMissing(tags, 'year', yearOf(v));
          else if (sid === 'IGNR') setIfMissing(tags, 'genre', v);
          else if (sid === 'ITRK') setIfMissing(tags, 'trackNumber', firstInt(v));
          q += 8 + len + (len & 1);
        }
    }
    p = body + size + (size & 1);
  }
  if (byteRate > 0 && dataSize > 0) tags.durationMs = Math.round((dataSize * 1000) / byteRate);
  return tags;
}
