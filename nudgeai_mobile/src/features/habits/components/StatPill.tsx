import { StyleSheet, Text as RNText, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors, radius } from '@/theme';

type StatPillProps = {
  emoji: string;
  label: string;
};

/** Small grey capsule in a screen header: "🔥 7 days streak", "😒 2/5". */
export function StatPill({ emoji, label }: StatPillProps) {
  return (
    <View style={styles.pill}>
      <RNText style={styles.emoji}>{emoji}</RNText>
      <Text variant="body" color={colors.textSecondary}>
        {label}
      </Text>
    </View>
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
  emoji: { fontSize: 18 },
});
