import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/ui';
import { colors, radius } from '@/theme';

type Props = { remaining: number; noun: string; onPress: () => void };

/** "See more" under a list that is showing only its first few items. Renders nothing when done. */
export function SeeMore({ remaining, noun, onPress }: Props) {
  if (remaining <= 0) return null;
  return (
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
  );
}

const styles = StyleSheet.create({
  button: {
    marginTop: 10,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
