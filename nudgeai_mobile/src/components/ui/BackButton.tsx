import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { colors, shadows } from '@/theme';

import { Icon } from './Icon';

type BackButtonProps = {
  onPress?: () => void;
  /** Frosted look used over the coloured intro slides. */
  translucent?: boolean;
  /** Where to go when there is nothing to go back to (e.g. the screen was opened by the splash). */
  fallback?: Href;
};

export function BackButton({ onPress, translucent = false, fallback = '/' }: BackButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={8}
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace(fallback)))}
      style={({ pressed }) => [
        styles.base,
        translucent ? styles.translucent : styles.solid,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Icon name="chevron-back" size={22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  solid: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    ...shadows.card,
  },
  translucent: {
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
});
