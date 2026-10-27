import { ScrollView, StyleSheet, Text as RNText } from 'react-native';

import { Chip } from '@/components/ui';
import { gutter } from '@/theme';

import { QUICK_PROMPTS } from '../data';
import type { QuickPrompt } from '../types';

type QuickPromptsProps = {
  onSelect: (prompt: QuickPrompt) => void;
};

export function QuickPrompts({ onSelect }: QuickPromptsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {QUICK_PROMPTS.map((p, i) => (
        <Chip
          key={p.id}
          label={p.label}
          selected={i === 0}
          leading={<RNText style={styles.emoji}>{p.emoji}</RNText>}
          onPress={() => onSelect(p)}
          style={styles.chip}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { marginHorizontal: -gutter, flexGrow: 0 },
  row: { paddingHorizontal: gutter, gap: 12 },
  chip: { height: 52, paddingHorizontal: 22 },
  emoji: { fontSize: 20 },
});
