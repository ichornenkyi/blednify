import type { MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { create, useStore } from 'zustand';

import { ChromeDock, ChromeSurface, NAV_PILL_HEIGHT } from '../chrome';
import { haptics } from '../haptics';
import { makeStyles, space, TAB_BAR_HEIGHT, useColors } from '../theme';
import { Icon, type IconName } from './Icon';
import { MiniPlayer } from './MiniPlayer';
import { Text } from './Text';

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: 'Home', icon: 'home-outline', iconActive: 'home' },
  search: { label: 'Search', icon: 'search-outline', iconActive: 'search' },
  library: { label: 'Library', icon: 'albums-outline', iconActive: 'albums' },
};

/** Custom bottom tab bar for the tab pager, with the MiniPlayer docked on top. Rendered in-flow so screens never sit under it. */
export function TabBar({ state, emitter, navigateToTab, insets }: MaterialTopTabBarProps) {
  const styles = useStyles();
  const colors = useColors();
  // One tick per tab change, whether it came from a tap or a swipe of the pager.
  const lastIndex = useRef(state.index);
  useEffect(() => {
    if (state.index !== lastIndex.current) haptics.select();
    lastIndex.current = state.index;
  }, [state.index]);
  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <MiniPlayer />
      <View style={styles.row} accessibilityRole="tablist">
        {state.routes.map((route, i) => {
          const tab = TABS[route.name];
          if (!tab) return null;
          const focused = i === state.index;
          const color = focused ? colors.text : colors.textTertiary;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              style={styles.tab}
              onPress={() => {
                const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigateToTab(route.key);
              }}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}>
              <Icon name={focused ? tab.iconActive : tab.icon} size={24} color={color} strokeWidth={focused ? 2.6 : 2} />
              <Text variant="micro" color={color} style={styles.label}>
                {tab.label}
              </Text>
              <View style={[styles.dot, focused && styles.dotActive]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Floating navigation

/**
 * The floating pills are drawn over the pager from outside it (glass has to be a sibling of what it
 * blurs), so the navigator hands its state across: `TabBarBridge` sits in the `tabBar` slot and publishes.
 * `position` is the pager's live scroll position (driven natively), so the pill follows the finger
 * mid-swipe instead of waiting for the page to settle.
 */
type Position = Animated.AnimatedInterpolation<number>;
const tabsStore = create<{ names: readonly string[]; keys: readonly string[]; position: Position; jumpTo: (key: string) => void }>(() => ({
  names: [],
  keys: [],
  position: new Animated.Value(0).interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
  jumpTo: () => {},
}));

export function TabBarBridge({ state, position, jumpTo }: MaterialTopTabBarProps) {
  const { routes } = state;
  useEffect(() => {
    tabsStore.setState({ names: routes.map((r) => r.name), keys: routes.map((r) => r.key), position, jumpTo });
  }, [routes, position, jumpTo]);
  return null;
}

const PILL_PAD = 6;

/** Mini player and navigation as pills floating over the tab screens. */
export function FloatingTabs() {
  return (
    <ChromeDock>
      <MiniPlayer />
      <FloatingTabBar />
    </ChromeDock>
  );
}

function FloatingTabBar() {
  const styles = useStyles();
  const names = useStore(tabsStore, (s) => s.names);
  const keys = useStore(tabsStore, (s) => s.keys);
  const position = useStore(tabsStore, (s) => s.position);
  const jumpTo = useStore(tabsStore, (s) => s.jumpTo);
  const [width, setWidth] = useState(0);
  const slot = names.length > 0 ? (width - PILL_PAD * 2) / names.length : 0;
  // The tab nearest the pager's position: flips (with a tick) as a swipe crosses the middle, not when it settles.
  const [active, setActive] = useState(0);
  useEffect(() => {
    let last = -1;
    const id = position.addListener(({ value }) => {
      const next = Math.round(value);
      if (next === last) return;
      if (last !== -1) haptics.select();
      last = next;
      setActive(next);
    });
    return () => position.removeListener(id);
  }, [position]);
  const x = useMemo(
    () => {
      const last = Math.max(1, names.length - 1);
      return position.interpolate({ inputRange: [0, last], outputRange: [0, last * slot], extrapolate: 'clamp' });
    },
    [position, slot, names.length],
  );
  return (
    <ChromeSurface radius={NAV_PILL_HEIGHT / 2} style={styles.pill}>
      <View style={styles.pillRow} accessibilityRole="tablist" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {slot > 0 ? <Animated.View pointerEvents="none" style={[styles.highlight, { width: slot, transform: [{ translateX: x }] }]} /> : null}
        {names.map((name, i) => (
          <FloatingTab
            key={name}
            name={name}
            index={i}
            position={position}
            focused={i === active}
            onPress={() => {
              const key = keys[i];
              if (i !== active && key) jumpTo(key);
            }}
          />
        ))}
      </View>
    </ChromeSurface>
  );
}

/** Icon only until it is the active tab, then its label opens beside it; both track the pager position. */
function FloatingTab({ name, index, position, focused, onPress }: { name: string; index: number; position: Position; focused: boolean; onPress: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  const tab = TABS[name];
  const [labelWidth, setLabelWidth] = useState(0);
  const { on, off, shift, labelOpacity } = useMemo(() => {
    const p = position.interpolate({ inputRange: [index - 1, index, index + 1], outputRange: [0, 1, 0], extrapolate: 'clamp' });
    return {
      on: p,
      off: p.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
      // Inactive, the icon sits centred and the (invisible) label hangs off its right side.
      shift: p.interpolate({ inputRange: [0, 1], outputRange: [(labelWidth + space.sm) / 2, 0] }),
      labelOpacity: p.interpolate({ inputRange: [0.35, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    };
  }, [position, index, labelWidth]);
  if (!tab) return null;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={tab.label}
      style={styles.pillTab}
      onPress={onPress}>
      <Animated.View style={[styles.pillGroup, { transform: [{ translateX: shift }] }]}>
        <View style={styles.pillIcon}>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: off }]}>
            <Icon name={tab.icon} size={24} color={colors.textSecondary} strokeWidth={2} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: on }]}>
            <Icon name={tab.iconActive} size={24} color={colors.text} strokeWidth={2.6} />
          </Animated.View>
        </View>
        <Animated.View style={[styles.pillLabel, { opacity: labelOpacity }]} onLayout={(e) => setLabelWidth(e.nativeEvent.layout.width)}>
          <Text variant="bodyStrong" color={colors.text} numberOfLines={1}>
            {tab.label}
          </Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  pill: { height: NAV_PILL_HEIGHT },
  pillRow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: PILL_PAD },
  highlight: {
    position: 'absolute',
    left: PILL_PAD,
    height: NAV_PILL_HEIGHT - PILL_PAD * 2,
    borderRadius: (NAV_PILL_HEIGHT - PILL_PAD * 2) / 2,
    backgroundColor: colors.track,
  },
  pillTab: { flex: 1, height: NAV_PILL_HEIGHT - PILL_PAD * 2, alignItems: 'center', justifyContent: 'center' },
  pillGroup: { flexDirection: 'row', alignItems: 'center' },
  pillIcon: { width: 24, height: 24 },
  pillLabel: { marginLeft: space.sm },
  root: { backgroundColor: colors.bg, paddingTop: space.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: { height: TAB_BAR_HEIGHT, flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { letterSpacing: 0.2, fontWeight: '600' },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2, backgroundColor: 'transparent' },
  dotActive: { backgroundColor: colors.accent },
}));
