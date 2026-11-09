import { TopTabs } from 'expo-router/js-top-tabs';
import { useWindowDimensions } from 'react-native';

import { TabBar } from '@/ui/components/TabBar';
import { useColors } from '@/ui/theme';

/**
 * The bottom tabs are a native pager (react-native-pager-view) with the tab bar docked at the
 * bottom: the neighbouring tab follows the finger and the swipe settles on the UI thread.
 */
export default function TabsLayout() {
  const bg = useColors().bg;
  const { width } = useWindowDimensions();
  return (
    <TopTabs
      tabBarPosition="bottom"
      initialLayout={{ width }}
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ sceneStyle: { backgroundColor: bg } }}>
      <TopTabs.Screen name="index" options={{ title: 'Home' }} />
      <TopTabs.Screen name="search" options={{ title: 'Search' }} />
      <TopTabs.Screen name="library" options={{ title: 'Library' }} />
    </TopTabs>
  );
}
