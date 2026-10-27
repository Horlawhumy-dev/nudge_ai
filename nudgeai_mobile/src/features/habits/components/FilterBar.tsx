import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/ui';
import { gutter } from '@/theme';

type FilterBarProps<T extends string> = {
  filters: readonly T[];
  value: T;
  onChange: (filter: T) => void;
};

/** Horizontally scrolling pill filters ("All / Morning / ..."). Bleeds to the screen edge. */
export function FilterBar<T extends string>({ filters, value, onChange }: FilterBarProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
    >
      {filters.map((f) => (
        <Chip key={f} label={f} selected={f === value} onPress={() => onChange(f)} style={styles.chip} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { marginHorizontal: -gutter, flexGrow: 0 },
  row: { paddingHorizontal: gutter, gap: 12 },
  chip: { height: 44, paddingHorizontal: 26 },
});
