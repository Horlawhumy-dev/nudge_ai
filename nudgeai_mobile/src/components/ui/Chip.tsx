import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { colors, radius } from '@/theme';

import { Text } from './Text';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  leading?: ReactNode;
  /** `tag` is the small read-only pill on habit cards. */
  size?: 'md' | 'tag';
  /** Unselected look: white (filter bars) or grey (forms). */
  tone?: 'white' | 'grey';
  style?: StyleProp<ViewStyle>;
};

export function Chip({ label, selected = false, onPress, leading, size = 'md', tone = 'white', style }: ChipProps) {
  const background = selected ? colors.primaryTint : tone === 'white' ? colors.surface : colors.fill;
  const body = (
    <View
      style={[
        styles.base,
        size === 'tag' ? styles.tag : styles.md,
        { backgroundColor: background },
        tone === 'white' && !selected && size === 'md' && styles.outlined,
        style,
      ]}
    >
      {leading}
      <Text variant={size === 'tag' ? 'body' : 'bodyLarge'} color={colors.text}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.pill },
  md: { height: 42, paddingHorizontal: 20 },
  tag: { height: 30, paddingHorizontal: 12 },
  outlined: { borderWidth: 1, borderColor: colors.borderSoft },
});
