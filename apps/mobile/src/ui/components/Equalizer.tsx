import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { colors } from '../theme';

const BARS = [
  { min: 0.25, max: 1, duration: 420, rest: 0.45 },
  { min: 0.35, max: 0.8, duration: 560, rest: 0.75 },
  { min: 0.2, max: 0.95, duration: 360, rest: 0.35 },
].map((bar) => ({
  ...bar,
  keyframes: { from: { transform: [{ scaleY: bar.min }] }, to: { transform: [{ scaleY: bar.max }] } },
}));

/**
 * Animated "now playing" bars; they settle when paused. A CSS animation, so on web the browser runs it instead of
 * JavaScript redrawing every frame for as long as music plays.
 */
export function Equalizer({ playing, size = 14, color = colors.accent }: { playing: boolean; size?: number; color?: string }) {
  return (
    <View style={[styles.row, { height: size, width: size }]} accessibilityLabel={playing ? 'Playing' : 'Paused'}>
      {BARS.map((bar, i) => (
        <Bar key={i} bar={bar} playing={playing} color={color} />
      ))}
    </View>
  );
}

function Bar({ bar, playing, color }: { bar: (typeof BARS)[number]; playing: boolean; color: string }) {
  return (
    <Animated.View
      style={[
        styles.bar,
        { backgroundColor: color },
        playing
          ? {
              animationName: bar.keyframes,
              animationDuration: bar.duration,
              animationTimingFunction: 'ease-in-out',
              animationIterationCount: 'infinite',
              animationDirection: 'alternate',
            }
          : { transform: [{ scaleY: bar.rest }], transitionProperty: 'transform', transitionDuration: 180 },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  bar: { width: '24%', height: '100%', borderRadius: 1.5, transformOrigin: 'bottom' },
});
