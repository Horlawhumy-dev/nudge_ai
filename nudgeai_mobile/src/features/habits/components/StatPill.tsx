import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors, radius } from '@/theme';

type StatPillProps = {
  emoji: string;
  label: string;
  /** Makes the pill a button (e.g. open the streak screen). */
  onPress?: () => void;
};

/** Small grey capsule in a screen header: "🔥 7 days streak", "😒 2/5". */
export function StatPill({ emoji, label, onPress }: StatPillProps) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      style={styles.pill}
      {...(onPress
        ? { onPress, accessibilityRole: 'button' as const, accessibilityLabel: label }
        : {})}
    >
      <RNText style={styles.emoji}>{emoji}</RNText>
      <Text variant="body" color={colors.textSecondary} style={styles.label}>
        {label}
      </Text>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.fill,
  },
  emoji: { fontSize: 16 },
  label: { fontSize: 13 },
});
