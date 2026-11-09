import type { MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

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

const useStyles = makeStyles((colors) => ({
  root: { backgroundColor: colors.bg, paddingTop: space.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: { height: TAB_BAR_HEIGHT, flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { letterSpacing: 0.2, fontWeight: '600' },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2, backgroundColor: 'transparent' },
  dotActive: { backgroundColor: colors.accent },
}));
