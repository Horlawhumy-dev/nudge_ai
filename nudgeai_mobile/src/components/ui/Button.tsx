import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { colors, radius, shadows } from '@/theme';

import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'outline' | 'ghost';

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  /** Rendered before the label, e.g. a social logo. */
  leading?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const surface: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, fg: colors.textOnPrimary },
  secondary: { bg: colors.fill, fg: colors.text },
  dark: { bg: colors.inverse, fg: colors.textOnInverse },
  outline: { bg: colors.surface, fg: colors.primary, border: colors.primary },
  ghost: { bg: 'transparent', fg: colors.primary },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  leading,
  style,
  testID,
}: ButtonProps) {
  const inactive = disabled || loading;
  const tone = surface[variant];
  const dimmed = disabled && (variant === 'primary' || variant === 'dark');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: dimmed ? colors.fillDisabled : tone.bg,
          borderColor: tone.border ?? 'transparent',
          borderWidth: tone.border ? 1 : 0,
          opacity: pressed ? 0.85 : 1,
        },
        variant === 'primary' && !disabled && shadows.glow,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone.fg} />
      ) : (
        <View style={styles.row}>
          {leading}
          <Text variant="button" color={dimmed ? colors.textDisabled : tone.fg}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
