import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

import { Text } from './Text';

type UnderlineTabsProps<T extends string> = {
  tabs: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
};

export function UnderlineTabs<T extends string>({ tabs, value, onChange }: UnderlineTabsProps<T>) {
  return (
    <View style={styles.row}>
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(tab.key)}
            style={[styles.tab, { borderBottomColor: active ? colors.primary : colors.borderSoft }]}
          >
            <Text variant="subheading" color={active ? colors.primary : colors.text}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2 },
});
