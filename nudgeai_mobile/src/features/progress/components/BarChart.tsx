import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors, radius } from '@/theme';

import type { BarDatum } from '../types';

type BarChartProps = {
  data: readonly BarDatum[];
  height?: number;
};

const TICKS = [100, 80, 60, 40, 20, 0];

/** Capsule bars on a 0–100% scale. Each bar is a pale track with a filled portion. */
export function BarChart({ data, height = 280 }: BarChartProps) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.axis, { height }]}>
        {TICKS.map((t) => (
          <Text key={t} variant="body" color={colors.textSecondary}>
            {t}%
          </Text>
        ))}
      </View>
      <View style={styles.bars}>
        {data.map((d) => (
          <View
            key={d.label}
            style={styles.column}
            accessible
            accessibilityLabel={`${d.label}: ${d.value} percent`}
          >
            <View style={[styles.track, { height }]}>
              <View style={[styles.fill, { height: `${Math.max(0, Math.min(100, d.value))}%` }]} />
            </View>
            <Text variant="body" color={colors.textSecondary}>
              {d.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 10 },
  axis: { justifyContent: 'space-between', width: 40, marginBottom: 28 },
  bars: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  column: { alignItems: 'center', gap: 10 },
  track: {
    width: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  fill: { width: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },
});
