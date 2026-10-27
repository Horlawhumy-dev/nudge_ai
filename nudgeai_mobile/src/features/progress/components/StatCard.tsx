import { StyleSheet } from 'react-native';

import { Card, Text } from '@/components/ui';
import { colors } from '@/theme';

type StatCardProps = {
  value: string;
  label: string;
  /** Emoji shown before the value (the streak flame). */
  prefix?: string;
  valueColor?: string;
  style?: object;
};

export function StatCard({ value, label, prefix, valueColor = colors.text, style }: StatCardProps) {
  return (
    <Card
      padding={14}
      radiusSize="lg"
      style={[styles.card, style]}
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text variant="numeral" color={valueColor}>
        {prefix ? `${prefix} ` : ''}
        {value}
      </Text>
      <Text variant="body" color={colors.textSecondary} align="center">
        {label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 82 },
});
