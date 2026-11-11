import { TopTabs } from 'expo-router/js-top-tabs';
import { Platform, useWindowDimensions, type ViewStyle } from 'react-native';

import { ChromeHost, useChromeStyle } from '@/ui/chrome';
import { FloatingTabs, TabBar, TabBarBridge } from '@/ui/components/TabBar';
import { useIsWide } from '@/ui/layout';
import { useColors } from '@/ui/theme';

/** Web: the strip of pages slides on its own GPU layer, so a tab switch moves pixels instead of repainting the pages. */
const PAGER_STYLE = Platform.OS === 'web' ? ({ willChange: 'transform' } as ViewStyle) : undefined;

/**
 * The bottom tabs are a native pager (react-native-pager-view) with the tab bar docked at the
 * bottom: the neighbouring tab follows the finger and the swipe settles on the UI thread.
 */
export default function TabsLayout() {
  const bg = useColors().bg;
  const { width } = useWindowDimensions();
  // Wide layout: the sidebar navigates and the player bar plays, so no tab bar and no swiping between tabs.
  const wide = useIsWide();
  // Floating styles draw their pills over the pager (see ChromeHost); the tab bar slot only reports state.
  const floating = useChromeStyle() !== 'classic';
  return (
    <ChromeHost overlay={floating ? <FloatingTabs /> : null}>
      <TopTabs
        tabBarPosition="bottom"
        initialLayout={{ width }}
        pagerStyle={PAGER_STYLE}
        tabBar={wide ? () => null : floating ? (props) => <TabBarBridge {...props} /> : (props) => <TabBar {...props} />}
        screenOptions={{ sceneStyle: { backgroundColor: bg }, swipeEnabled: !wide, animationEnabled: !wide }}>
        <TopTabs.Screen name="index" options={{ title: 'Home' }} />
        <TopTabs.Screen name="search" options={{ title: 'Search' }} />
        <TopTabs.Screen name="library" options={{ title: 'Library' }} />
      </TopTabs>
    </ChromeHost>
  );
}
