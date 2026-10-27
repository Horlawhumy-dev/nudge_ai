import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { dateKey, monthGrid, parseDateKey, type DateKey } from '@/lib/date';
import { colors, radius } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

type CalendarPickerProps = {
  value: DateKey | null;
  onChange: (key: DateKey) => void;
  /** Earliest selectable day; earlier days are dimmed and disabled. */
  minDate?: DateKey;
};

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Month grid with prev/next. Monday-first, like the rest of the app. */
export function CalendarPicker({ value, onChange, minDate }: CalendarPickerProps) {
  const anchor = value ? parseDateKey(value) : new Date();
  const [cursor, setCursor] = useState({ year: anchor.getFullYear(), month: anchor.getMonth() });
  const today = dateKey();
  const cells = monthGrid(cursor.year, cursor.month);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  const title = new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const shift = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  };

  return (
    <View style={styles.card} accessibilityLabel={`Calendar, ${title}`}>
      <View style={styles.head}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={10}
          onPress={() => shift(-1)}
        >
          <Icon name="chevron-back" size={22} />
        </Pressable>
        <Text variant="subheading">{title}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={10}
          onPress={() => shift(1)}
        >
          <Icon name="chevron-forward" size={22} />
        </Pressable>
      </View>
      <View style={styles.row}>
        {WEEKDAYS.map((d, i) => (
          <Text
            key={i}
            variant="caption"
            color={colors.textMuted}
            align="center"
            style={styles.cell}
          >
            {d}
          </Text>
        ))}
      </View>
      {weeks.map((week, w) => (
        <View key={w} style={styles.row}>
          {week.map((key, i) => {
            if (!key) return <View key={i} style={styles.cell} />;
            const disabled = minDate !== undefined && key < minDate;
            const selected = key === value;
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={key}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => onChange(key)}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.day,
                    key === today && styles.today,
                    selected && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                >
                  <Text
                    variant="body"
                    color={selected ? colors.white : disabled ? colors.textDisabled : colors.text}
                  >
                    {Number(key.slice(8))}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 12,
    gap: 6,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingBottom: 6,
  },
  row: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 40 },
  day: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  today: { borderColor: colors.primary },
});
