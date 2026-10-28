import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

type FormErrorProps = {
  message: string | null | undefined;
};

/** Form-level error banner (the kind that isn't about one field, e.g. "Incorrect email or password"). */
export function FormError({ message }: FormErrorProps) {
  if (!message) return null;
  return (
    <View style={styles.box} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <Icon name="alert-circle" size={20} color={colors.danger} />
      <Text variant="body" color={colors.danger} style={styles.text}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
  text: { flex: 1 },
});
