import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors, radius } from '@/theme';

import type { TaskPriority } from '../types';

const TONES: Record<TaskPriority, { bg: string; fg: string }> = {
  High: { bg: colors.danger, fg: colors.white },
  Medium: { bg: colors.accents[1], fg: colors.white },
  Low: { bg: colors.primaryTint, fg: colors.primaryPressed },
};

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const tone = TONES[priority];
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text variant="caption" color={tone.fg} style={styles.label}>
        {priority}
      </Text>
    </View>
  );
}

export const priorityDotColor: Record<TaskPriority, string> = {
  High: colors.danger,
  Medium: colors.accents[1],
  Low: colors.primaryTint,
};

const styles = StyleSheet.create({
  badge: {
    height: 20,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 11, lineHeight: 14 },
});
