import Svg, { Defs, G, LinearGradient, Mask, Path, Rect, Stop } from 'react-native-svg';

// Same geometry as assets/brand/blednify-mark.svg (1024 design grid).
const B =
  'M318 280Q318 236 362 236H584C700 236 770 296 770 384C770 438 742 480 694 502C756 524 792 574 792 642C792 734 718 788 604 788H362Q318 788 318 744Z' +
  'M444 340H570C614 340 642 362 642 398C642 434 614 456 570 456H444Z' +
  'M444 550H584C636 550 664 576 664 616C664 658 636 684 584 684H444Z';
const WAVE =
  'M130 503C160 503 170 473 200 473S262 533 292 533S354 473 384 473S446 533 476 533S538 473 568 473S630 533 660 533S722 473 752 473S814 533 844 533S906 473 936 473';

/** Blednify brand mark: crimson tile with the sound-wave-cut "B". */
export function BrandMark({ size = 56 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel="Blednify">
      <Defs>
        <LinearGradient id="bg" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#F0484B" />
          <Stop offset="1" stopColor="#B8161B" />
        </LinearGradient>
        <Mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
          <Rect width="1024" height="1024" fill="#fff" />
          <Path d={WAVE} fill="none" stroke="#000" strokeWidth={30} strokeLinecap="round" />
        </Mask>
      </Defs>
      <Rect width="1024" height="1024" rx="232" fill="url(#bg)" />
      <G transform="translate(-43 0)">
        <Path d={B} fill="#fff" fillRule="evenodd" mask="url(#cut)" />
      </G>
    </Svg>
  );
}
