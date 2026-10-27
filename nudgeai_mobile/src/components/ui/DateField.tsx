import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useNow } from '@/hooks/useNow';
import { addDays, dateKey, displayFromKey, formatRelativeDate, type DateKey } from '@/lib/date';
import { colors, radius } from '@/theme';

import { CalendarPicker } from './CalendarPicker';
import { Icon } from './Icon';
import { Text } from './Text';

type DateFieldProps = {
  label?: string;
  value: DateKey;
  onChange: (key: DateKey) => void;
  minDate?: DateKey;
};

/** Filled field showing "Today · 27/10/2026"; expands an inline calendar (no nested modal). */
export function DateField({ label, value, onChange, minDate }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const now = useNow();
  const relative = formatRelativeDate(value, now);
  const showRelative = ['Today', 'Tomorrow', 'Yesterday'].includes(relative);

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="subheading" color={colors.textSecondary}>
          {label}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label ?? 'Date'}: ${displayFromKey(value)}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={styles.field}
      >
        <Text variant="body" style={styles.value}>
          {showRelative ? `${relative}  ·  ` : ''}
          {displayFromKey(value)}
        </Text>
        <Icon name="calendar-outline" size={22} color={colors.textSecondary} />
      </Pressable>
      {open ? (
        <>
          <View style={styles.quick}>
            {[0, 1].map((offset) => {
              const key = dateKey(addDays(now, offset));
              const on = value === key;
              return (
                <Pressable
                  key={offset}
                  accessibilityRole="button"
                  onPress={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                  style={[styles.quickChip, on && { backgroundColor: colors.primaryTint }]}
                >
                  <Text variant="body">{offset === 0 ? 'Today' : 'Tomorrow'}</Text>
                </Pressable>
              );
            })}
          </View>
          <CalendarPicker
            value={value}
            minDate={minDate}
            onChange={(key) => {
              onChange(key);
              setOpen(false);
            }}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  field: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  value: { flex: 1 },
  quick: { flexDirection: 'row', gap: 10 },
  quickChip: {
    height: 38,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
