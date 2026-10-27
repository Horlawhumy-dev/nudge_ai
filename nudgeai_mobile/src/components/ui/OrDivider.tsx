import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

import { Text } from './Text';

export function OrDivider() {
  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <Text variant="bodyLarge">or</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  line: { flex: 1, height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.border },
});
