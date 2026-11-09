import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/ui/components/TabBar';
import { useColors } from '@/ui/theme';

export default function TabsLayout() {
  const bg = useColors().bg;
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: bg }, animation: 'fade' }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
    </Tabs>
  );
}
