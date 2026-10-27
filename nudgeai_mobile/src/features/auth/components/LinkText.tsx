import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors } from '@/theme';

type LinkTextProps = {
  prefix?: string;
  action: string;
  onPress: () => void;
  align?: 'center' | 'right';
};

/** "Don't have an account? Create account" style footer link. */
export function LinkText({ prefix, action, onPress, align = 'center' }: LinkTextProps) {
  return (
    <View style={[styles.row, align === 'right' && styles.right]}>
      {prefix ? <Text variant="bodyLarge">{prefix} </Text> : null}
      <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8}>
        <Text variant="bodyLarge" color={colors.primary}>
          {action}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  right: { justifyContent: 'flex-end' },
});
