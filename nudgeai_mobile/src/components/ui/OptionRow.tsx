import { Pressable, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';

import { colors, radius } from '@/theme';

import { Text } from './Text';

type OptionRowProps = {
  title: string;
  description?: string;
  /** Emoji or small icon shown at the left. */
  leading?: ReactNode;
  selected: boolean;
  onPress: () => void;
  /** `pill` for single-line time options, `card` for the tone options with a description. */
  shape?: 'pill' | 'card';
};

export function OptionRow({
  title,
  description,
  leading,
  selected,
  onPress,
  shape = 'pill',
}: OptionRowProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.base,
        shape === 'pill' ? styles.pill : styles.card,
        { backgroundColor: selected ? colors.primaryTint : colors.surfaceMuted },
      ]}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.texts}>
        <Text variant="bodyLarge" style={styles.title}>
          {title}
        </Text>
        {description ? (
          <Text variant="body" color={colors.textSecondary} style={styles.description}>
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  pill: { height: 56, borderRadius: radius.pill, paddingHorizontal: 20 },
  card: { minHeight: 84, borderRadius: radius.md, paddingHorizontal: 20, paddingVertical: 14 },
  leading: { width: 36, alignItems: 'flex-start', justifyContent: 'center' },
  texts: { flex: 1 },
  title: { fontSize: 16 },
  description: { marginTop: 4 },
});
