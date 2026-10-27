import { Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/components/ui';
import { colors } from '@/theme';

type CheckboxProps = {
  checked: boolean;
  onPress: () => void;
  accessibilityLabel: string;
};

/** Round tick used by habit cards and task rows. */
export function Checkbox({ checked, onPress, accessibilityLabel }: CheckboxProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked }}
      hitSlop={10}
      onPress={onPress}
      style={[styles.box, checked ? styles.checked : styles.unchecked]}
    >
      {checked ? <Icon name="checkmark" size={14} color={colors.white} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: colors.primary },
  unchecked: { borderWidth: 1.5, borderColor: colors.textSecondary },
});
