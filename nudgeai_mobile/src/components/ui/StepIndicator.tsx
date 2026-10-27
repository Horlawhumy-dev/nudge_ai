import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

import { Text } from './Text';

type StepIndicatorProps = {
  step: number;
  total: number;
};

export function StepIndicator({ step, total }: StepIndicatorProps) {
  return (
    <View accessibilityLabel={`Step ${step} of ${total}`}>
      <Text variant="body" color={colors.textMuted} align="right" style={styles.caption}>
        Step {step}/{total}
      </Text>
      <View style={styles.row}>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[styles.segment, i + 1 === step && { backgroundColor: colors.primary }]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { marginBottom: 8 },
  row: { flexDirection: 'row', gap: 14 },
  segment: { flex: 1, height: 5, borderRadius: radius.pill, backgroundColor: colors.track },
});
