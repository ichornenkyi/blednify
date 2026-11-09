import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

// Same geometry as assets/icon.svg (1024 design grid).
const WAVE_PATH =
  'M 452 286 C 590 286 658 332 658 398 C 658 458 590 494 452 496 C 600 498 682 540 682 622 C 682 704 600 746 452 746';

export interface BrandMarkProps {
  size?: number;
  /** Tile background color. When omitted, uses the brand crimson gradient; when passed, uses flat fill. */
  color?: string;
  /** Glyph color (default: '#FFFFFF'). */
  glyphColor?: string;
}

/** Blednify brand mark: crimson tile with the minimal acoustic pulse soundwave "B". */
export function BrandMark({ size = 56, color, glyphColor = '#FFFFFF' }: BrandMarkProps) {
  const bgFill = color ?? 'url(#bg)';

  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel="Blednify">
      {!color && (
        <Defs>
          <LinearGradient id="bg" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#F0484B" />
            <Stop offset="1" stopColor="#B8161B" />
          </LinearGradient>
        </Defs>
      )}
      <Rect width={1024} height={1024} rx={224} fill={bgFill} />
      {/* Pillar: Audio playhead column */}
      <Rect x={294} y={244} width={104} height={504} rx={52} fill={glyphColor} />
      {/* Harmonic acoustic soundwave */}
      <Path
        d={WAVE_PATH}
        fill="none"
        stroke={glyphColor}
        strokeWidth={84}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
