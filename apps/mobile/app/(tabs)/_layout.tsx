// The four top-level destinations, under the floating pill navigation (design round 2026-11-28).
// Everything else (study, compare, search, prayer flows, vault, account) is a stack screen pushed
// over these tabs from the root layout, so it gets a back gesture and no pill.
import { Tabs } from 'expo-router/js-tabs';

import { FloatingNav } from '../../src/app/nav/FloatingNav';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      tabBar={(props) => <FloatingNav {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg.canvas } }}
    >
      <Tabs.Screen name="read" options={{ title: 'Read' }} />
      <Tabs.Screen name="pray" options={{ title: 'Pray' }} />
      <Tabs.Screen name="journal" options={{ title: 'Journal' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
    </Tabs>
  );
}
