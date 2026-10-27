import { Pressable, StyleSheet } from 'react-native';

import { colors, shadows } from '@/theme';

import { Icon } from './Icon';

type FabProps = {
  onPress: () => void;
  accessibilityLabel: string;
  bottom?: number;
};

export function Fab({ onPress, accessibilityLabel, bottom = 110 }: FabProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.fab, { bottom }, pressed && { opacity: 0.85 }]}
    >
      <Icon name="add" size={34} color={colors.textOnPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.glow,
  },
});
