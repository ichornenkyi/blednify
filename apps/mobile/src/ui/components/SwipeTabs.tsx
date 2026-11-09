import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptics } from '../haptics';

/** Left-to-right order of the bottom tabs; must match the `(tabs)` layout. */
export const TAB_ORDER = ['index', 'search', 'library'] as const;

const DISTANCE = 0.28; // fraction of screen width that commits a switch
const FLING = 800;

type Props = {
  routeName: string;
  navigate: (name: string) => void;
  children: ReactNode;
};

/**
 * Screen layout for the tab navigator: swipe ←/→ anywhere on a tab to move to the neighbouring tab.
 * The pan starts late (24 px) so horizontal rails and chip rows, which grab the touch sooner, keep
 * their own scrolling; vertical lists fail it.
 */
export function SwipeTabs({ routeName, navigate, children }: Props) {
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);
  const i = TAB_ORDER.indexOf(routeName as (typeof TAB_ORDER)[number]);
  const prev = i > 0 ? TAB_ORDER[i - 1] : null;
  const next = i >= 0 && i < TAB_ORDER.length - 1 ? TAB_ORDER[i + 1] : null;

  const go = (name: string) => {
    haptics.select();
    navigate(name);
  };

  const pan = usePanGesture({
    enabled: i >= 0,
    activeOffsetX: [-24, 24],
    failOffsetY: [-14, 14],
    onUpdate: (e) => {
      'worklet';
      const t = e.translationX;
      // Rubber-band past the first / last tab.
      const blocked = (t > 0 && !prev) || (t < 0 && !next);
      x.set(blocked ? t * 0.12 : t);
    },
    onDeactivate: (e) => {
      'worklet';
      const t = e.translationX;
      const target = t < 0 ? next : prev;
      const commit = target !== null && (Math.abs(t) > width * DISTANCE || Math.abs(e.velocityX) > FLING) && Math.sign(e.velocityX || t) === Math.sign(t);
      if (commit) {
        scheduleOnRN(go, target);
        // The tab fade hides this scene; ease it back so it is centred when the user returns.
        x.set(withTiming(0, { duration: 260 }));
      } else {
        x.set(withSpring(0, { damping: 22, stiffness: 260 }));
      }
    },
  });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() * 0.35 }],
    opacity: interpolate(Math.abs(x.get()), [0, width * 0.6], [1, 0.55], 'clamp'),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.fill, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
