import { Pressable, StyleSheet } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { colors, radius } from '@/theme';

type DemoHintProps = {
  /** What tapping fills in; shown after "Tap to fill". */
  children: string;
  onPress?: () => void;
};

/** Small notice for the static build: tells testers which values exercise success paths. */
export function DemoHint({ children, onPress }: DemoHintProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      disabled={!onPress}
      onPress={onPress}
      style={styles.box}
    >
      <Icon name="flask-outline" size={18} color={colors.primary} />
      <Text variant="caption" color={colors.primaryPressed} style={styles.text}>
        {children}
        {onPress ? '  ·  Tap to fill' : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  text: { flex: 1 },
});
