import { StyleSheet, Text as RNText, View } from 'react-native';

import { OptionRow } from '@/components/ui';

import { TONES, type ToneId } from '../data';

type ToneOptionsProps = {
  value: ToneId | null;
  name: string;
  onChange: (tone: ToneId) => void;
};

export function ToneOptions({ value, name, onChange }: ToneOptionsProps) {
  return (
    <View style={styles.list} accessibilityRole="radiogroup">
      {TONES.map((tone) => (
        <OptionRow
          key={tone.id}
          shape="card"
          title={tone.title}
          description={tone.sample(name || 'there')}
          leading={<RNText style={styles.emoji}>{tone.emoji}</RNText>}
          selected={value === tone.id}
          onPress={() => onChange(tone.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 14 },
  emoji: { fontSize: 22 },
});
