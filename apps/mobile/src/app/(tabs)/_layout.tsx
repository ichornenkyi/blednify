import { Tabs } from 'expo-router/js-tabs';

import { SwipeTabs } from '@/ui/components/SwipeTabs';
import { TabBar } from '@/ui/components/TabBar';
import { useColors } from '@/ui/theme';

export default function TabsLayout() {
  const bg = useColors().bg;
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenLayout={({ route, navigation, children }) => (
        <SwipeTabs routeName={route.name} navigate={(name) => navigation.navigate(name)}>
          {children}
        </SwipeTabs>
      )}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: bg }, animation: 'fade' }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
    </Tabs>
  );
}
