import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useColors, type Palette } from '../theme';

/** Deterministic PRNG so every screen draws the same sky (no jump when navigating). */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

type Star = { x: number; y: number; r: number; o: number };

/** Static stars on a 100 x 200 grid (stretched to cover the screen). */
const STARS: Star[] = (() => {
  const rand = rng(7);
  return Array.from({ length: 110 }, () => {
    const big = rand() > 0.9;
    return { x: rand() * 100, y: rand() * 200, r: big ? 0.32 + rand() * 0.18 : 0.12 + rand() * 0.16, o: 0.25 + rand() * 0.55 };
  });
})();

/** A few brighter stars that twinkle, positioned in % of the screen. */
const TWINKLERS = (() => {
  const rand = rng(42);
  return Array.from({ length: 9 }, () => ({
    left: `${4 + rand() * 92}%` as const,
    top: `${3 + rand() * 80}%` as const,
    size: 2 + Math.round(rand() * 2),
    delay: Math.round(rand() * 3000),
    duration: 1600 + Math.round(rand() * 2200),
  }));
})();

function Twinkle({ left, top, size, delay, duration, color }: (typeof TWINKLERS)[number] & { color: string }) {
  const o = useSharedValue(0.2);
  useEffect(() => {
    o.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }), -1, true));
    return () => cancelAnimation(o);
  }, [o, delay, duration]);
  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: 0.7 + o.value * 0.5 }] }));
  return (
    <Animated.View
      style={[
        { position: 'absolute', left, top, width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        { shadowColor: color, shadowOpacity: 0.9, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
        style,
      ]}
    />
  );
}

function Stars({ colors }: { colors: Palette }) {
  const tint = colors.isLight ? colors.textTertiary : '#FFFFFF';
  return (
    <>
      <LinearGradient
        colors={[colors.accentSoft, 'transparent', 'transparent', colors.accentSoft]}
        locations={[0, 0.35, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 200" preserveAspectRatio="xMidYMid slice">
        {STARS.map((s, i) => (
          <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill={tint} opacity={s.o} />
        ))}
      </Svg>
      {TWINKLERS.map((t, i) => (
        <Twinkle key={i} {...t} color={i % 3 === 0 ? colors.accent : tint} />
      ))}
    </>
  );
}

/**
 * Theme decoration behind a screen's content (Starry night's sky, a soft accent glow). Render it as the
 * first child of a screen's root view; it draws nothing for themes without a backdrop.
 */
export function Backdrop() {
  const colors = useColors();
  if (colors.backdrop === 'none') return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {colors.backdrop === 'stars' ? (
        <Stars colors={colors} />
      ) : (
        <LinearGradient
          colors={[colors.accentSoft, 'transparent']}
          locations={[0, 0.45]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  );
}
