import { StyleSheet, Text as RNText, View } from 'react-native';

import { OptionRow } from '@/components/ui';

import type { TimeOption } from '../data';

type TimeOptionsProps = {
  options: readonly TimeOption[];
  value: string | null;
  onChange: (id: string) => void;
};

/** Single-choice list of time ranges; used by onboarding and the wake/sleep settings. */
export function TimeOptions({ options, value, onChange }: TimeOptionsProps) {
  return (
    <View style={styles.list} accessibilityRole="radiogroup">
      {options.map((o) => (
        <OptionRow
          key={o.id}
          title={o.label}
          leading={<RNText style={styles.emoji}>{o.emoji}</RNText>}
          selected={value === o.id}
          onPress={() => onChange(o.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 14 },
  emoji: { fontSize: 22 },
});
