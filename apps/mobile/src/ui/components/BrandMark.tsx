import Svg, { Circle, Defs, LinearGradient, Mask, Rect, Stop } from 'react-native-svg';

// Same geometry as assets/icon.svg (1024 design grid): a speaker driver seen from the front — square frame
// with four screw holes, surround ring, stepped cone, dust cap.
const SCREWS = [
  [322, 322],
  [702, 322],
  [322, 702],
  [702, 702],
] as const;

export type BrandMarkProps = {
  size?: number;
  /** Tile color. Omitted: the brand crimson gradient. */
  color?: string;
  /** Glyph color (default white). */
  glyphColor?: string;
};

/** Blednify brand mark. */
export function BrandMark({ size = 56, color, glyphColor = '#FFFFFF' }: BrandMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel="Blednify">
      <Defs>
        <LinearGradient id="bmTile" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#F0484B" />
          <Stop offset="1" stopColor="#B8161B" />
        </LinearGradient>
        <Mask id="bmFrame" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
          <Rect x={224} y={224} width={576} height={576} rx={136} fill="#fff" />
          <Circle cx={512} cy={512} r={244} fill="#000" />
          {SCREWS.map(([x, y]) => (
            <Circle key={`${x}-${y}`} cx={x} cy={y} r={24} fill="#000" />
          ))}
        </Mask>
      </Defs>
      <Rect width={1024} height={1024} rx={224} fill={color ?? 'url(#bmTile)'} />
      <Rect width={1024} height={1024} fill={glyphColor} mask="url(#bmFrame)" />
      <Circle cx={512} cy={512} r={212} fill="none" stroke={glyphColor} strokeWidth={30} />
      <Circle cx={512} cy={512} r={176} fill={glyphColor} fillOpacity={0.28} />
      <Circle cx={512} cy={512} r={138} fill={glyphColor} fillOpacity={0.28} />
      <Circle cx={512} cy={512} r={100} fill={glyphColor} fillOpacity={0.32} />
      <Circle cx={512} cy={512} r={80} fill={glyphColor} />
    </Svg>
  );
}
