// Regenerates every Blednify icon asset from the vector master (1024 grid): a rounded beamed note with a
// magenta-to-electric-blue glow on a frosted glass plate with a faint wireframe lattice, on a matte dark squircle.
// Needs @resvg/resvg-js, which is not a repo dependency:
//   T=$(mktemp -d) && (cd $T && bun add @resvg/resvg-js) && cp tools/brand/build-icons.ts $T && bun $T/build-icons.ts
// Run from the repo root. Pass `--8k` to also write an 8192 px render to /tmp/blednify-icon-8k.png.
import { Resvg } from '@resvg/resvg-js';

const DEFS = `
  <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1024" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#15131F"/><stop offset="1" stop-color="#07070C"/>
  </linearGradient>
  <radialGradient id="vignette" cx="512" cy="470" r="620" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#2A1640" stop-opacity="0.55"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="neon" x1="300" y1="760" x2="740" y2="260" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#FF2BD6"/><stop offset="0.5" stop-color="#9B4DFF"/><stop offset="1" stop-color="#2E8BFF"/>
  </linearGradient>
  <linearGradient id="sheen" x1="0" y1="250" x2="0" y2="770" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#fff" stop-opacity="0.32"/><stop offset="0.4" stop-color="#fff" stop-opacity="0.04"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="glass" x1="0" y1="196" x2="0" y2="828" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#fff" stop-opacity="0.14"/><stop offset="1" stop-color="#fff" stop-opacity="0.03"/>
  </linearGradient>
  <linearGradient id="glassEdge" x1="196" y1="196" x2="828" y2="828" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#fff" stop-opacity="0.45"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.06"/><stop offset="1" stop-color="#fff" stop-opacity="0.25"/>
  </linearGradient>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="46"/></filter>
  <filter id="glowTight" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
  <!-- Rounded beamed eighth notes -->
  <g id="noteShape">
    <line x1="452" y1="318" x2="712" y2="262" stroke-width="84" stroke-linecap="round"/>
    <line x1="452" y1="318" x2="452" y2="662" stroke-width="54" stroke-linecap="round"/>
    <line x1="712" y1="262" x2="712" y2="606" stroke-width="54" stroke-linecap="round"/>
    <ellipse cx="380" cy="676" rx="96" ry="72" transform="rotate(-22 380 676)"/>
    <ellipse cx="640" cy="620" rx="96" ry="72" transform="rotate(-22 640 620)"/>
  </g>
  <mask id="noteMask" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
    <use href="#noteShape" fill="#fff" stroke="#fff" transform="translate(512 512) scale(0.94) translate(-522 -484)"/>
  </mask>
  <clipPath id="plateClip"><rect x="196" y="196" width="632" height="632" rx="172"/></clipPath>
  <radialGradient id="fadeGrad" cx="512" cy="512" r="380" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>
  <mask id="fade" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><rect width="1024" height="1024" fill="url(#fadeGrad)"/></mask>
  <radialGradient id="bloom" cx="512" cy="540" r="420" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7A2CFF" stop-opacity="0.35"/><stop offset="1" stop-color="#7A2CFF" stop-opacity="0"/></radialGradient>
`;

/** Matte dark tile: base gradient, violet vignette, soft bloom. `rx` 0 = full bleed. */
const background = (rx: number) => `
<rect width="1024" height="1024" rx="${rx}" fill="url(#tile)"/>
<rect width="1024" height="1024" rx="${rx}" fill="url(#vignette)"/>
<rect width="1024" height="1024" rx="${rx}" fill="url(#bloom)"/>`;

/** Glow, glass plate, lattice and the note. */
const EMBLEM = `<!-- glow behind glass -->
<g opacity="0.75" filter="url(#glow)"><rect width="1024" height="1024" fill="url(#neon)" mask="url(#noteMask)"/></g>
<!-- frosted glass plate -->
<rect x="196" y="196" width="632" height="632" rx="172" fill="url(#glass)" stroke="url(#glassEdge)" stroke-width="3"/>
<!-- wireframe facets: triangular lattice inside the glass plate, fading out from the center -->
<g clip-path="url(#plateClip)" mask="url(#fade)"><path d="M-188 -444L1212 -444M990 -572L1690 640M1690 384L990 1596M-188 -364L1212 -364M921 -532L1621 680M1621 344L921 1556M-188 -285L1212 -285M852 -493L1552 720M1552 304L852 1517M-188 -205L1212 -205M783 -453L1483 760M1483 264L783 1477M-188 -125L1212 -125M714 -413L1414 800M1414 224L714 1437M-188 -46L1212 -46M645 -373L1345 839M1345 185L645 1397M-188 34L1212 34M576 -333L1276 879M1276 145L576 1357M-188 114L1212 114M507 -293L1207 919M1207 105L507 1317M-188 193L1212 193M438 -254L1138 959M1138 65L438 1278M-188 273L1212 273M369 -214L1069 999M1069 25L369 1238M-188 353L1212 353M300 -174L1000 1039M1000 -15L300 1198M-188 432L1212 432M231 -134L931 1078M931 -54L231 1158M-188 512L1212 512M162 -94L862 1118M862 -94L162 1118M-188 592L1212 592M93 -54L793 1158M793 -134L93 1078M-188 671L1212 671M24 -15L724 1198M724 -174L24 1039M-188 751L1212 751M-45 25L655 1238M655 -214L-45 999M-188 831L1212 831M-114 65L586 1278M586 -254L-114 959M-188 910L1212 910M-183 105L517 1317M517 -293L-183 919M-188 990L1212 990M-252 145L448 1357M448 -333L-252 879M-188 1070L1212 1070M-321 185L379 1397M379 -373L-321 839M-188 1149L1212 1149M-390 224L310 1437M310 -413L-390 800M-188 1229L1212 1229M-459 264L241 1477M241 -453L-459 760M-188 1309L1212 1309M-528 304L172 1517M172 -493L-528 720M-188 1388L1212 1388M-597 344L103 1556M103 -532L-597 680M-188 1468L1212 1468M-666 384L34 1596M34 -572L-666 640" stroke="#fff" stroke-opacity="0.16" stroke-width="2" fill="none"/></g>
<!-- the note -->
<g filter="url(#glowTight)" opacity="0.6"><rect width="1024" height="1024" fill="url(#neon)" mask="url(#noteMask)"/></g>
<rect width="1024" height="1024" fill="url(#neon)" mask="url(#noteMask)"/>
<rect width="1024" height="1024" fill="url(#sheen)" mask="url(#noteMask)"/>
<!-- facet lines on the note -->
<g mask="url(#noteMask)"><g transform="translate(512 512) scale(0.94) translate(-522 -484)" stroke="#fff" stroke-opacity="0.24" stroke-width="3.5" fill="none">
  <path d="M290 650 L420 610 L470 735 M420 610 L452 318 M550 595 L680 555 L735 680 M680 555 L712 262 M452 318 L585 300 L712 262 M585 300 L452 662"/>
</g></g>
`;

/** The note alone in one flat color (monochrome / iOS glyph). */
const silhouette = (color: string) => `<rect width="1024" height="1024" fill="${color}" mask="url(#noteMask)"/>`;

const svg = (inner: string, viewBox = '0 0 1024 1024') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="${viewBox}">\n<defs>${DEFS}</defs>${inner}\n</svg>\n`;
const scaled = (s: number, inner: string) => `<g transform="translate(512 512) scale(${s}) translate(-512 -512)">${inner}</g>`;
const png = (src: string, size: number) => new Resvg(src, { fitTo: { mode: 'width', value: size } }).render().asPng();

const master = svg(background(232) + EMBLEM);
await Bun.write('assets/icon.svg', master);
await Bun.write('apps/mobile/assets/images/icon.png', png(svg(background(0) + EMBLEM), 1024));
// Adaptive icon: the plate's corners must stay inside the circle every launcher mask shows (radius ~341).
await Bun.write('apps/mobile/assets/images/android-icon-background.png', png(svg(background(0)), 1024));
await Bun.write('apps/mobile/assets/images/android-icon-foreground.png', png(svg(scaled(0.78, EMBLEM)), 1024));
await Bun.write('apps/mobile/assets/images/android-icon-monochrome.png', png(svg(scaled(0.7, silhouette('#FFFFFF'))), 1024));
// Splash (on #0A0A0C): the emblem cropped to the plate.
await Bun.write('apps/mobile/assets/images/splash-icon.png', png(svg(EMBLEM, '150 150 724 724'), 456));
// iOS 26 icon composer layer: the glyph alone; icon.json supplies the dark fill and the glass effects.
await Bun.write('apps/mobile/assets/expo.icon/Assets/blednify-glyph.png', png(svg(silhouette('#FFFFFF')), 1024));
if (process.argv.includes('--8k')) await Bun.write('/tmp/blednify-icon-8k.png', png(master, 8192));
console.log('ok');
