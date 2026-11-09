// Regenerates every app icon asset from the Blednify mark (speaker driver, 1024 grid).
// Needs @resvg/resvg-js, which is not a repo dependency: `cd $(mktemp -d) && bun add @resvg/resvg-js && cp <repo>/tools/brand/build-icons.ts . && cd <repo> && bun <tmp>/build-icons.ts`.
import { Resvg } from '@resvg/resvg-js';

const BG = `<linearGradient id="bg" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#F0484B"/><stop offset="1" stop-color="#B8161B"/></linearGradient>`;
const MASK = `<mask id="frame" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
    <rect x="224" y="224" width="576" height="576" rx="136" fill="#fff"/>
    <circle cx="512" cy="512" r="244" fill="#000"/>
    <circle cx="322" cy="322" r="24" fill="#000"/><circle cx="702" cy="322" r="24" fill="#000"/>
    <circle cx="322" cy="702" r="24" fill="#000"/><circle cx="702" cy="702" r="24" fill="#000"/>
  </mask>`;
const glyph = (c: string) => `<g>
  <rect width="1024" height="1024" fill="${c}" mask="url(#frame)"/>
  <circle cx="512" cy="512" r="212" fill="none" stroke="${c}" stroke-width="30"/>
  <circle cx="512" cy="512" r="176" fill="${c}" fill-opacity="0.28"/>
  <circle cx="512" cy="512" r="138" fill="${c}" fill-opacity="0.28"/>
  <circle cx="512" cy="512" r="100" fill="${c}" fill-opacity="0.32"/>
  <circle cx="512" cy="512" r="80" fill="${c}"/>
</g>`;
const svg = (inner: string, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">\n  <defs>${defs}${MASK}</defs>\n  ${inner}\n</svg>\n`;
const scaled = (s: number, inner: string) => `<g transform="translate(512 512) scale(${s}) translate(-512 -512)">${inner}</g>`;
const png = (src: string, size: number) =>
  new Resvg(src, { fitTo: { mode: 'width', value: size } }).render().asPng();

const icon = svg(`<rect width="1024" height="1024" rx="224" fill="url(#bg)"/>\n  ${glyph('#FFFFFF')}`, BG);
const fullTile = svg(`<rect width="1024" height="1024" fill="url(#bg)"/>\n  ${glyph('#FFFFFF')}`, BG);
await Bun.write('assets/icon.svg', icon);
await Bun.write('apps/mobile/assets/images/icon.png', png(fullTile, 1024));
// Adaptive layers: keep the glyph inside the always-visible circle of every launcher mask.
await Bun.write('apps/mobile/assets/images/android-icon-foreground.png', png(svg(scaled(0.8, glyph('#FFFFFF'))), 1024));
await Bun.write('apps/mobile/assets/images/android-icon-background.png', png(svg(`<rect width="1024" height="1024" fill="url(#bg)"/>`, BG), 1024));
await Bun.write('apps/mobile/assets/images/android-icon-monochrome.png', png(svg(scaled(0.8, glyph('#FFFFFF'))), 1024));
await Bun.write('apps/mobile/assets/images/splash-icon.png', png(svg(glyph('#E5383B')), 456));
await Bun.write('apps/mobile/assets/expo.icon/Assets/blednify-glyph.png', png(svg(glyph('#FFFFFF')), 1024));
console.log('ok');
