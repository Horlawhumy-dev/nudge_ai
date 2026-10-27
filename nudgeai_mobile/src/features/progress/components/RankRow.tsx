import type { ReactNode } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';

import { ProgressRing, Text } from '@/components/ui';
import { colors, radius } from '@/theme';

type RankRowProps = {
  emoji?: string;
  icon?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  /** Completion ring (0–100) on the right. */
  completion?: number;
  ringColor?: string;
  ringCaption?: string;
  trailing?: ReactNode;
};

/** A bordered row in the "Top performing" and "Most overdue" cards. */
export function RankRow({
  emoji,
  icon,
  title,
  subtitle,
  completion,
  ringColor = colors.primary,
  ringCaption,
  trailing,
}: RankRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.tile}>{icon ?? <RNText style={styles.emoji}>{emoji}</RNText>}</View>
      <View style={styles.texts}>
        <Text variant="subheading" numberOfLines={1}>
          {title}
        </Text>
        {subtitle}
      </View>
      {completion !== undefined ? (
        <View style={styles.ring}>
          <ProgressRing
            progress={completion / 100}
            size={50}
            strokeWidth={5}
            color={ringColor}
            label={`${completion}%`}
            labelSize="sm"
          />
          {ringCaption ? (
            <Text variant="caption" color={colors.textSecondary}>
              {ringCaption}
            </Text>
          ) : null}
        </View>
      ) : null}
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
  },
  tile: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 22 },
  texts: { flex: 1, gap: 4 },
  ring: { alignItems: 'center', gap: 4 },
});
