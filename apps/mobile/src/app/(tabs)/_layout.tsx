import { TopTabs } from 'expo-router/js-top-tabs';
import { useWindowDimensions } from 'react-native';

import { TabBar } from '@/ui/components/TabBar';
import { useIsWide } from '@/ui/layout';
import { useColors } from '@/ui/theme';

/**
 * The bottom tabs are a native pager (react-native-pager-view) with the tab bar docked at the
 * bottom: the neighbouring tab follows the finger and the swipe settles on the UI thread.
 */
export default function TabsLayout() {
  const bg = useColors().bg;
  const { width } = useWindowDimensions();
  // Wide layout: the sidebar navigates and the player bar plays, so no tab bar and no swiping between tabs.
  const wide = useIsWide();
  return (
    <TopTabs
      tabBarPosition="bottom"
      initialLayout={{ width }}
      tabBar={wide ? () => null : (props) => <TabBar {...props} />}
      screenOptions={{ sceneStyle: { backgroundColor: bg }, swipeEnabled: !wide, animationEnabled: !wide }}>
      <TopTabs.Screen name="index" options={{ title: 'Home' }} />
      <TopTabs.Screen name="search" options={{ title: 'Search' }} />
      <TopTabs.Screen name="library" options={{ title: 'Library' }} />
    </TopTabs>
  );
}
