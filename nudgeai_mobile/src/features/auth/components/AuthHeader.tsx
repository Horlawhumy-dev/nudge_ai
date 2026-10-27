import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors } from '@/theme';

type AuthHeaderProps = {
  title: string;
  subtitle: string;
};

export function AuthHeader({ title, subtitle }: AuthHeaderProps) {
  return (
    <View style={styles.wrap}>
      <Text variant="title">{title}</Text>
      <Text variant="bodyLarge" color={colors.textSecondary} style={styles.subtitle}>
        {subtitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 40, marginBottom: 36 },
  subtitle: { marginTop: 6 },
});
