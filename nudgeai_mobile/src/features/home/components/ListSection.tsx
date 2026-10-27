import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { colors, radius, shadows } from '@/theme';

type ListSectionProps = {
  title: string;
  onAdd: () => void;
  addLabel: string;
  children: ReactNode;
};

/** White panel with a title and a small "+" button, wrapping Home's habit and to-do lists. */
export function ListSection({ title, onAdd, addLabel, children }: ListSectionProps) {
  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <Text variant="subheading" color={colors.textSecondary}>
          {title}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={addLabel} onPress={onAdd} style={styles.add}>
          <Icon name="add" size={26} color={colors.white} />
        </Pressable>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 14, borderWidth: 1, borderColor: colors.borderSoft },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, paddingVertical: 4, marginBottom: 10 },
  add: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', ...shadows.glow },
  body: { gap: 12 },
});
