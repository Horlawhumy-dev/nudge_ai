import { StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { formatOrdinalDate } from '@/lib/format';
import { colors, palette, radius } from '@/theme';

import type { DayStatus } from '../types';

const CELL_COLOR: Record<DayStatus, string> = {
  completed: colors.primary,
  some: '#9E9E9E',
  missed: palette.gray200,
  today: palette.salmon,
  future: colors.surface,
};

const LEGEND: readonly { status: DayStatus; label: string }[] = [
  { status: 'missed', label: 'Missed' },
  { status: 'some', label: 'Some progress' },
  { status: 'completed', label: 'Completed' },
  { status: 'today', label: 'Today' },
];

type ConsistencyMapProps = {
  days: readonly DayStatus[];
  today?: Date;
};

export function ConsistencyMap({ days, today = new Date() }: ConsistencyMapProps) {
  const weeks = Array.from({ length: Math.ceil(days.length / COLUMNS) }, (_, w) =>
    days.slice(w * COLUMNS, (w + 1) * COLUMNS)
  );

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text variant="body" color={colors.textSecondary}>
          Consistency Map
        </Text>
        <View style={styles.date}>
          <Icon name="calendar-outline" size={16} color={colors.textSecondary} />
          <Text variant="caption">Today, {formatOrdinalDate(today)}</Text>
        </View>
      </View>
      <View style={styles.grid}>
        {weeks.map((week, w) => (
          <View key={w} style={styles.week}>
            {Array.from({ length: COLUMNS }, (_, d) => {
              const status = week[d];
              if (!status) return <View key={d} style={styles.cell} />;
              return (
                <View
                  key={d}
                  accessibilityLabel={`Day ${w * COLUMNS + d + 1}: ${status}`}
                  style={[
                    styles.cell,
                    { backgroundColor: CELL_COLOR[status] },
                    status === 'future' && styles.cellFuture,
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        {LEGEND.map((l) => (
          <View key={l.status} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: CELL_COLOR[l.status] }]} />
            <Text variant="body" color={colors.textSecondary}>
              {l.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const COLUMNS = 7;
const GAP = 8;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 16,
    gap: 16,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  grid: { gap: GAP },
  week: { flexDirection: 'row', gap: GAP },
  cell: { flex: 1, height: 28, borderRadius: 7 },
  cellFuture: { borderWidth: 1, borderColor: colors.borderSoft },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 14, height: 14, borderRadius: 4 },
});
