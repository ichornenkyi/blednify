import type { MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
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
 */
const tabsStore = create<{ index: number; names: readonly string[] }>(() => ({ index: 0, names: [] }));
let jumpTo: (name: string) => void = () => {};

export function TabBarBridge({ state, navigateToTab }: MaterialTopTabBarProps) {
  const { index, routes } = state;
  useEffect(() => {
    jumpTo = (name) => {
      const route = routes.find((r) => r.name === name);
      if (route) navigateToTab(route.key);
    };
    tabsStore.setState({ index, names: routes.map((r) => r.name) });
  }, [index, routes, navigateToTab]);
  return null;
}

const PILL_PAD = 6;
const GLIDE = { duration: 320, easing: Easing.bezier(0.16, 1, 0.3, 1) };
const IS_WEB = Platform.OS === 'web';
const WEB_HIGHLIGHT_GLIDE = {
  transitionProperty: 'transform',
  transitionDuration: '320ms',
  transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as object;
const WEB_LABEL_GLIDE = {
  ...WEB_HIGHLIGHT_GLIDE,
  transitionProperty: 'opacity, clip-path',
} as object;
// Keep intrinsic label widths constant. Move the whole group to center it when active,
// rather than laying out the pill again on every frame of a width animation.
const WEB_TAB_CONTENT = {
  position: 'absolute', left: '50%', top: '50%', width: 'max-content',
  flexDirection: 'row', alignItems: 'center',
} as object;

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
  const index = useStore(tabsStore, (s) => s.index);
  const names = useStore(tabsStore, (s) => s.names);
  const reducedMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const slot = names.length > 0 ? (width - PILL_PAD * 2) / names.length : 0;
  // One tick per tab change, whether it came from a tap or a swipe of the pager.
  const lastIndex = useRef(index);
  useEffect(() => {
    if (index !== lastIndex.current) haptics.select();
    lastIndex.current = index;
  }, [index]);
  // The highlight glides to the active tab; it starts in place instead of sliding in from the left.
  const x = useSharedValue(0);
  const placed = useRef(false);
  useEffect(() => {
    if (IS_WEB) return;
    if (slot <= 0) return;
    x.set(placed.current ? withTiming(index * slot, GLIDE) : index * slot);
    placed.current = true;
  }, [index, slot, x]);
  const highlight = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return (
    <ChromeSurface radius={NAV_PILL_HEIGHT / 2} style={styles.pill}>
      <View style={styles.pillRow} accessibilityRole="tablist" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {slot > 0 ? (
          IS_WEB ? (
            <View
              pointerEvents="none"
              style={[
                styles.highlight,
                { width: slot, transform: [{ translateX: index * slot }] },
                WEB_HIGHLIGHT_GLIDE,
                reducedMotion && ({ transitionDuration: '0ms' } as object),
              ]}
            />
          ) : <Animated.View pointerEvents="none" style={[styles.highlight, { width: slot }, highlight]} />
        ) : null}
        {names.map((name, i) => (
          <FloatingTab key={name} name={name} focused={i === index} />
        ))}
      </View>
    </ChromeSurface>
  );
}

/** Icon only until it is the active tab, then its label opens beside it. */
function FloatingTab({ name, focused }: { name: string; focused: boolean }) {
  const styles = useStyles();
  const colors = useColors();
  const tab = TABS[name];
  const reducedMotion = useReducedMotion();
  const open = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    if (IS_WEB) return;
    open.set(withTiming(focused ? 1 : 0, GLIDE));
  }, [focused, open]);
  const label = useAnimatedStyle(() => ({ maxWidth: open.get() * 96, opacity: open.get(), marginLeft: open.get() * space.sm }));
  if (!tab) return null;
  const color = focused ? colors.text : colors.textSecondary;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={tab.label}
      style={[styles.pillTab, IS_WEB && { overflow: 'hidden' }]}
      onPress={() => {
        if (!focused) jumpTo(name);
      }}>
      {IS_WEB ? (
        <View pointerEvents="none" style={[
          WEB_TAB_CONTENT,
          { transform: [{ translateX: focused ? '-50%' : -12 }, { translateY: '-50%' }] } as object,
          WEB_HIGHLIGHT_GLIDE,
          reducedMotion && ({ transitionDuration: '0ms' } as object),
        ]}>
          <Icon name={focused ? tab.iconActive : tab.icon} size={24} color={color} strokeWidth={focused ? 2.6 : 2} />
          <View style={[
            styles.pillLabel,
            { maxWidth: 96, marginLeft: space.sm, opacity: focused ? 1 : 0 },
            { clipPath: focused ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)' } as object,
            WEB_LABEL_GLIDE,
            reducedMotion && ({ transitionDuration: '0ms' } as object),
          ]}>
            <Text variant="bodyStrong" color={color} numberOfLines={1}>
              {tab.label}
            </Text>
          </View>
        </View>
      ) : (
        <>
          <Icon name={focused ? tab.iconActive : tab.icon} size={24} color={color} strokeWidth={focused ? 2.6 : 2} />
          <Animated.View style={[styles.pillLabel, label]}>
            <Text variant="bodyStrong" color={color} numberOfLines={1}>
              {tab.label}
            </Text>
          </Animated.View>
        </>
      )}
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
  pillTab: { flex: 1, height: NAV_PILL_HEIGHT - PILL_PAD * 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  pillLabel: { overflow: 'hidden' },
  root: { backgroundColor: colors.bg, paddingTop: space.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: { height: TAB_BAR_HEIGHT, flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { letterSpacing: 0.2, fontWeight: '600' },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2, backgroundColor: 'transparent' },
  dotActive: { backgroundColor: colors.accent },
}));
