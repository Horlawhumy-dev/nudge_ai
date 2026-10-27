import { Pressable, StyleSheet } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { colors, radius } from '@/theme';

import type { ProgressPeriod } from '../types';

type PeriodPillProps = {
  value: ProgressPeriod;
  onChange: (value: ProgressPeriod) => void;
};

/** "Weekly ⌄" — switches between the two available periods. */
export function PeriodPill({ value, onChange }: PeriodPillProps) {
  const next: ProgressPeriod = value === 'Weekly' ? 'Monthly' : 'Weekly';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Period: ${value}. Switch to ${next}`}
      onPress={() => onChange(next)}
      style={styles.pill}
    >
      <Text variant="bodyLarge">{value}</Text>
      <Icon name="chevron-down" size={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
});
