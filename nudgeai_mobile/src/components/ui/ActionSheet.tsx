import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

import { BottomSheet } from './BottomSheet';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type SheetAction = {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  onPress: () => void;
};

type ActionSheetProps = {
  visible: boolean;
  title: string;
  actions: readonly SheetAction[];
  onClose: () => void;
};

/** A short list of actions in a bottom sheet (edit / delete menus). Closes before running the action. */
export function ActionSheet({ visible, title, actions, onClose }: ActionSheetProps) {
  return (
    <BottomSheet visible={visible} title={title} onClose={onClose}>
      <View style={styles.list}>
        {actions.map((a) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              a.onPress();
            }}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
          >
            {a.icon ? (
              <Icon
                name={a.icon}
                size={22}
                color={a.destructive ? colors.danger : colors.textSecondary}
              />
            ) : null}
            <Text variant="subheading" color={a.destructive ? colors.danger : colors.text}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10, paddingBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    height: 56,
    paddingHorizontal: 18,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
});
