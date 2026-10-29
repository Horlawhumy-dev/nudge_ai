import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors, radius } from '@/theme';

type Props = {
  remaining: number;
  noun: string;
  onPress: () => void;
  /** Given with `expanded`, adds a "See less" that goes back to the first page. */
  onLess?: () => void;
  expanded?: boolean;
};

/** "See more" / "See less" under a list that shows a few items at a time. Nothing when not needed. */
export function SeeMore({ remaining, noun, onPress, onLess, expanded = false }: Props) {
  const more = remaining > 0;
  const less = expanded && onLess !== undefined;
  if (!more && !less) return null;
  return (
    <View style={styles.row}>
      {more ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`See more ${noun}`}
          onPress={onPress}
          style={styles.button}
        >
          <Text variant="subheading" color={colors.primary}>
            See more ({remaining} more)
          </Text>
        </Pressable>
      ) : null}
      {less ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`See less ${noun}`}
          onPress={onLess}
          style={[styles.button, styles.less]}
        >
          <Text variant="subheading" color={colors.textSecondary}>
            See less
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: 10, flexDirection: 'row', gap: 10 },
  button: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  less: { backgroundColor: colors.fill },
});
