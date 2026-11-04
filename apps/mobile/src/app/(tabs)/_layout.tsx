import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/ui/components/TabBar';
import { colors } from '@/ui/theme';

const SCENE = { backgroundColor: colors.bg };

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: SCENE, animation: 'fade' }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
    </Tabs>
  );
}
