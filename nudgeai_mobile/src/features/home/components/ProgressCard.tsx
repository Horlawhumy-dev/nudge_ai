import { StyleSheet } from 'react-native';

import { Card, ProgressRing, Text } from '@/components/ui';
import { colors } from '@/theme';

type ProgressCardProps = {
  done: number;
  total: number;
  label: string;
  color: string;
};

export function ProgressCard({ done, total, label, color }: ProgressCardProps) {
  return (
    <Card
      padding={16}
      radiusSize="lg"
      style={styles.card}
      accessibilityLabel={`${label}: ${done} of ${total}`}
    >
      <ProgressRing
        progress={total > 0 ? done / total : 0}
        size={64}
        strokeWidth={6}
        color={color}
        label={`${done}/${total}`}
      />
      <Text variant="bodyLarge" color={colors.textSecondary}>
        {label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, alignItems: 'center', gap: 12 },
});
