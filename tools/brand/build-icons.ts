// Regenerates every Blednify icon asset from vector sources (1024 grid): a single rounded eighth note, drawn in
// one of several launcher icon variants that the app lets the user pick (Settings → App icon).
// Needs @resvg/resvg-js, which is not a repo dependency:
//   T=$(mktemp -d) && (cd $T && bun add @resvg/resvg-js) && cp tools/brand/build-icons.ts $T && bun $T/build-icons.ts
// Run from the repo root. Pass `--8k` to also write an 8192 px render of the default icon to /tmp/blednify-icon-8k.png.
//
// Every variant is an Android adaptive icon: a full-bleed background layer and a foreground layer with the note in
// the mask safe zone. Previews and legacy icons are the two layers composited and cropped to the visible 72/108.
// Variant ids are part of the Android manifest (activity alias names): never rename or remove one, only add.
import { Resvg } from '@resvg/resvg-js';

const OUT = 'apps/mobile/assets/app-icons';

/** The note: rounded head, stem and a curved flag, centered on (512 512). Fill/stroke come from the caller. */
const NOTE_PATH = `
  M520 252 a28 28 0 0 1 56 0
  C584 338 700 366 724 466 C740 536 712 594 674 630 C688 574 682 524 646 492 C620 468 592 458 576 456
  L576 700 C576 770 512 818 432 818 C362 818 318 782 318 732 C318 668 384 618 460 618 C482 618 502 622 520 630 Z`;
const NOTE = (attrs: string) => `<path transform="translate(-9 -23)" d="${NOTE_PATH}" ${attrs}/>`;

type Variant = {
  id: string;
  name: string;
  defs?: string;
  /** Full-bleed background layer. */
  bg: string;
  /** Foreground layer content at 1:1; it is scaled into the safe zone. */
  fg: string;
};

const sparkle = (x: number, y: number, r: number, fill: string, o = 1) =>
  `<path d="M${x} ${y - r}C${x + r * 0.12} ${y - r * 0.12} ${x + r * 0.12} ${y - r * 0.12} ${x + r} ${y}C${x + r * 0.12} ${y + r * 0.12} ${x + r * 0.12} ${y + r * 0.12} ${x} ${y + r}C${x - r * 0.12} ${y + r * 0.12} ${x - r * 0.12} ${y + r * 0.12} ${x - r} ${y}C${x - r * 0.12} ${y - r * 0.12} ${x - r * 0.12} ${y - r * 0.12} ${x} ${y - r}Z" fill="${fill}" opacity="${o}"/>`;
const dots = (pts: [number, number, number, number][]) =>
  pts.map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${o}"/>`).join('');
const grooves = Array.from({ length: 14 }, (_, i) => `<circle cx="512" cy="512" r="${250 + i * 22}" fill="none" stroke="#fff" stroke-opacity="${0.05 + (i % 3) * 0.02}" stroke-width="2"/>`).join('');

const lin = (id: string, stops: string[], x1 = 0, y1 = 0, x2 = 1024, y2 = 1024) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="userSpaceOnUse">${stops
    .map((c, i) => `<stop offset="${i / (stops.length - 1)}" stop-color="${c}"/>`)
    .join('')}</linearGradient>`;
const SOFT_SHADOW = `<filter id="shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="0.28"/></filter>`;
const GLOW = (sd: number) => `<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;
const SHEEN = `<linearGradient id="sheen" x1="0" y1="230" x2="0" y2="820" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="0.45" stop-color="#fff" stop-opacity="0.04"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;

const VARIANTS: Variant[] = [
  {
    id: 'neon',
    name: 'Neon',
    defs: `${lin('bg', ['#1A1726', '#08080D'], 0, 0, 0, 1024)}${lin('note', ['#FF2BD6', '#9B4DFF', '#2E8BFF'], 320, 820, 740, 250)}${GLOW(40)}${SHEEN}
      <radialGradient id="bloom" cx="512" cy="540" r="460" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7A2CFF" stop-opacity="0.38"/><stop offset="1" stop-color="#7A2CFF" stop-opacity="0"/></radialGradient>`,
    bg: `<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#bloom)"/>`,
    fg: `<g filter="url(#glow)" opacity="0.8">${NOTE('fill="url(#note)"')}</g>${NOTE('fill="url(#note)"')}${NOTE('fill="url(#sheen)"')}`,
  },
  {
    id: 'sunset',
    name: 'Sunset',
    defs: `${lin('bg', ['#8EA2FF', '#E59BFF', '#FF9EB5', '#FFC59A'], 0, 0, 1024, 1024)}${SOFT_SHADOW}`,
    bg: `<rect width="1024" height="1024" fill="url(#bg)"/>`,
    fg: `<g filter="url(#shadow)">${NOTE('fill="#221A33"')}</g>`,
  },
  {
    id: 'aurora',
    name: 'Aurora',
    defs: `${lin('bg', ['#FF9CC2', '#F5507F'], 0, 0, 0, 1024)}${SOFT_SHADOW}`,
    bg: `<rect width="1024" height="1024" fill="url(#bg)"/>`,
    fg: `<g filter="url(#shadow)">${NOTE('fill="#fff"')}</g>`,
  },
  {
    id: 'daylight',
    name: 'Daylight',
    defs: `${lin('note', ['#2E8BFF', '#7A5CFF'], 320, 820, 740, 250)}`,
    bg: `<rect width="1024" height="1024" fill="#FFFFFF"/>`,
    fg: NOTE('fill="url(#note)"'),
  },
  {
    id: 'midnight',
    name: 'Midnight',
    defs: `${lin('bg', ['#16245E', '#060A24'], 0, 0, 0, 1024)}${GLOW(26)}`,
    bg: `<rect width="1024" height="1024" fill="url(#bg)"/>${dots([
      [250, 230, 4, 0.8], [400, 200, 3, 0.6], [760, 220, 4, 0.7], [810, 420, 3, 0.5], [215, 470, 3, 0.5], [800, 640, 4, 0.7],
      [270, 800, 3, 0.6], [560, 195, 3, 0.5], [660, 820, 3, 0.5], [430, 830, 4, 0.6], [830, 540, 3, 0.4], [200, 620, 3, 0.5],
    ])}${sparkle(300, 330, 30, '#FFD66B')}${sparkle(735, 300, 22, '#FFD66B', 0.9)}${sparkle(745, 755, 26, '#FFD66B')}${sparkle(255, 720, 18, '#FFD66B', 0.85)}`,
    fg: `<g filter="url(#glow)" opacity="0.55">${NOTE('fill="#9DB8FF"')}</g>${NOTE('fill="#fff"')}`,
  },
  {
    id: 'cyber',
    name: 'Cyber',
    defs: `<filter id="outline" x="-20%" y="-20%" width="140%" height="140%"><feMorphology in="SourceGraphic" operator="erode" radius="26" result="in"/><feComposite in="SourceGraphic" in2="in" operator="out"/></filter>${GLOW(22)}`,
    bg: `<rect width="1024" height="1024" fill="#0B0B0E"/>`,
    fg: `<g filter="url(#glow)" opacity="0.9"><g filter="url(#outline)">${NOTE('fill="#FFE600"')}</g></g><g filter="url(#outline)">${NOTE('fill="#FFE600"')}</g>`,
  },
  {
    id: 'vinyl',
    name: 'Vinyl',
    defs: `${lin('note', ['#FF5E3A', '#FF2A68'], 320, 820, 740, 250)}${SOFT_SHADOW}
      <radialGradient id="disc" cx="512" cy="512" r="560" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#26262C"/><stop offset="1" stop-color="#0A0A0C"/></radialGradient>`,
    bg: `<rect width="1024" height="1024" fill="url(#disc)"/>${grooves}<path d="M512 512 L1024 120 L1024 300Z" fill="#fff" opacity="0.04"/><path d="M512 512 L0 900 L0 720Z" fill="#fff" opacity="0.04"/>`,
    fg: `<g filter="url(#shadow)">${NOTE('fill="url(#note)"')}</g>`,
  },
  {
    id: 'mint',
    name: 'Mint',
    defs: `${lin('bg', ['#5BF0C0', '#139E96'], 0, 0, 1024, 1024)}${SOFT_SHADOW}`,
    bg: `<rect width="1024" height="1024" fill="url(#bg)"/>`,
    fg: `<g filter="url(#shadow)">${NOTE('fill="#fff"')}</g>`,
  },
  {
    id: 'ocean',
    name: 'Ocean',
    defs: `${lin('bg', ['#00C6FF', '#2350FF'], 0, 0, 1024, 1024)}${SOFT_SHADOW}`,
    bg: `<rect width="1024" height="1024" fill="url(#bg)"/>`,
    fg: `<g filter="url(#shadow)">${NOTE('fill="#fff"')}</g>`,
  },
  {
    id: 'ember',
    name: 'Ember',
    defs: `${lin('bg', ['#FFB547', '#FF5A36', '#C2185B'], 0, 0, 1024, 1024)}${SOFT_SHADOW}`,
    bg: `<rect width="1024" height="1024" fill="url(#bg)"/>`,
    fg: `<g filter="url(#shadow)">${NOTE('fill="#fff"')}</g>`,
  },
  {
    id: 'mono',
    name: 'Mono',
    bg: `<rect width="1024" height="1024" fill="#000"/>`,
    fg: NOTE('fill="#fff"'),
  },
  {
    id: 'paper',
    name: 'Paper',
    defs: `${lin('bg', ['#F7F1E6', '#E9DFCC'], 0, 0, 0, 1024)}`,
    bg: `<rect width="1024" height="1024" fill="url(#bg)"/>`,
    fg: NOTE('fill="#1B1B1F"'),
  },
];

/** Foreground scale: the note's farthest point stays inside the 66 dp circle every launcher mask shows. */
const FG_SCALE = 0.74;
/** The part of an adaptive layer a launcher shows (72 of 108 dp). */
const VISIBLE = `${(1024 * 18) / 108} ${(1024 * 18) / 108} ${(1024 * 72) / 108} ${(1024 * 72) / 108}`;

const svg = (defs: string, inner: string, viewBox = '0 0 1024 1024') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="${viewBox}">\n<defs>${defs}</defs>${inner}\n</svg>\n`;
const scaled = (s: number, inner: string) => `<g transform="translate(512 512) scale(${s}) translate(-512 -512)">${inner}</g>`;
const png = (src: string, size: number) => new Resvg(src, { fitTo: { mode: 'width', value: size } }).render().asPng();

const fgLayer = (v: Variant) => scaled(FG_SCALE, v.fg);
const composite = (v: Variant, viewBox = VISIBLE) => svg(v.defs ?? '', v.bg + fgLayer(v), viewBox);

for (const v of VARIANTS) {
  // In-app picker preview, also the legacy (pre-adaptive) launcher icon.
  await Bun.write(`${OUT}/${v.id}.png`, png(composite(v), 288));
  if (v.id === VARIANTS[0].id) continue; // the default icon uses the main Expo icon assets below
  await Bun.write(`${OUT}/android/${v.id}-bg.png`, png(svg(v.defs ?? '', v.bg), 432));
  await Bun.write(`${OUT}/android/${v.id}-fg.png`, png(svg(v.defs ?? '', fgLayer(v)), 432));
}

const main = VARIANTS[0];
const silhouette = (s: number) => scaled(s, NOTE('fill="#fff"'));
await Bun.write('assets/icon.svg', composite(main));
await Bun.write('apps/mobile/assets/images/icon.png', png(composite(main), 1024));
await Bun.write('apps/mobile/assets/images/android-icon-background.png', png(svg(main.defs ?? '', main.bg), 1024));
await Bun.write('apps/mobile/assets/images/android-icon-foreground.png', png(svg(main.defs ?? '', fgLayer(main)), 1024));
await Bun.write('apps/mobile/assets/images/android-icon-monochrome.png', png(svg('', silhouette(FG_SCALE * 0.92)), 1024));
// Splash (on #0A0A0C): the glowing note alone.
await Bun.write('apps/mobile/assets/images/splash-icon.png', png(svg(main.defs ?? '', main.fg, '232 192 560 640'), 456));
// iOS 26 icon composer layer: the glyph alone; icon.json supplies the dark fill and the glass effects.
await Bun.write('apps/mobile/assets/expo.icon/Assets/blednify-glyph.png', png(svg('', silhouette(0.86)), 1024));
// Web app (Home Screen on iOS, PWA manifest). iOS masks the apple-touch-icon itself; "maskable" keeps the whole
// adaptive canvas so the note stays inside the manifest's 80% safe circle.
const WEB = 'apps/mobile/public/icons';
await Bun.write(`${WEB}/apple-touch-icon.png`, png(composite(main), 180));
await Bun.write(`${WEB}/icon-192.png`, png(composite(main), 192));
await Bun.write(`${WEB}/icon-512.png`, png(composite(main), 512));
await Bun.write(`${WEB}/maskable-512.png`, png(composite(main, '0 0 1024 1024'), 512));
// The variant list the app and the config plugin read.
await Bun.write(`${OUT}/variants.json`, JSON.stringify(VARIANTS.map(({ id, name }) => ({ id, name })), null, 2) + '\n');
await Bun.write(
  `${OUT}/index.ts`,
  `// Generated by tools/brand/build-icons.ts. Launcher icon variants; the first is the default.\n` +
    `export const APP_ICONS = [\n${VARIANTS.map((v) => `  { id: '${v.id}', name: '${v.name}', image: require('./${v.id}.png') },`).join('\n')}\n] as const;\n\n` +
    `export type AppIconId = (typeof APP_ICONS)[number]['id'];\n`,
);
if (process.argv.includes('--8k')) await Bun.write('/tmp/blednify-icon-8k.png', png(composite(main), 8192));
console.log('ok');
