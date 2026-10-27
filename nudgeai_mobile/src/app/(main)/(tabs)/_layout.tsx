import { Tabs } from 'expo-router/js-tabs';

import { FloatingTabBar } from '@/components/layout/FloatingTabBar';
import { colors } from '@/theme';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="habits" />
      <Tabs.Screen name="tasks" />
      <Tabs.Screen name="progress" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
