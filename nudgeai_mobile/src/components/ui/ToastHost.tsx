import { useEffect } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAnimatedValue } from '@/hooks/useAnimatedValue';
import { useToastStore, type Toast } from '@/store/useToastStore';
import { colors, radius, shadows } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

const ICON = {
  default: 'information-circle',
  success: 'checkmark-circle',
  error: 'alert-circle',
} as const;
const ICON_COLOR = { default: colors.white, success: '#7BE08A', error: '#FF8A6B' } as const;

function ToastView({ toast }: { toast: Toast }) {
  const insets = useSafeAreaInsets();
  const dismiss = useToastStore((s) => s.dismiss);
  const progress = useAnimatedValue(0);

  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [progress]);

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          // Sits below the 56pt header row so it never covers a back button or header action.
          top: insets.top + 64,
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) },
          ],
        },
      ]}
    >
      <Pressable accessibilityRole="alert" onPress={() => dismiss(toast.id)} style={styles.toast}>
        <Icon name={ICON[toast.tone]} size={22} color={ICON_COLOR[toast.tone]} />
        <Text variant="bodyMedium" color={colors.white} style={styles.message} numberOfLines={2}>
          {toast.message}
        </Text>
        {toast.action ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => {
              toast.action?.onPress();
              dismiss(toast.id);
            }}
          >
            <Text variant="bodyMedium" color={colors.primaryTint}>
              {toast.action.label}
            </Text>
          </Pressable>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/** Mount once near the root; renders the current toast above everything. */
export function ToastHost() {
  const current = useToastStore((s) => s.current);
  return current ? <ToastView key={current.id} toast={current} /> : null;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, zIndex: 100, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    maxWidth: 520,
    width: '100%',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.inverse,
    ...shadows.card,
  },
  message: { flex: 1 },
});
