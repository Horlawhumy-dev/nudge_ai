import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components/ui';
import { colors, gutter, shadows } from '@/theme';

import { TAB_BAR_HEIGHT, TAB_ITEMS, type TabName } from './tabs';

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.host, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const item = TAB_ITEMS[route.name as TabName];
          if (!item) return null;
          const focused = state.index === index;
          const tint = focused ? colors.primary : colors.textSecondary;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: focused }}
              onPress={onPress}
              style={[styles.tab, focused && styles.tabActive]}
            >
              <Icon name={item.icon} size={22} color={tint} />
              <Text variant="body" color={tint}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: gutter },
  bar: {
    height: TAB_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    ...shadows.card,
  },
  tab: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 28 },
  tabActive: { backgroundColor: colors.primarySoft },
});
