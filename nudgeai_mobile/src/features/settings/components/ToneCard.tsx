import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { colors, radius } from '@/theme';

import type { ToneOption } from '@/features/onboarding/data';

type ToneCardProps = {
  tone: ToneOption;
  name: string;
  selected: boolean;
  onPress: () => void;
};

export function ToneCard({ tone, name, selected, onPress }: ToneCardProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.card, selected && styles.selected]}
    >
      <RNText style={styles.emoji}>{tone.emoji}</RNText>
      <View style={styles.texts}>
        <Text variant="subheading">{tone.title}</Text>
        <Text variant="body" color={colors.textSecondary}>
          {tone.description}
        </Text>
        <Text variant="bodyMedium" color={colors.textSecondary} style={styles.sample}>
          {tone.sample(name)}
        </Text>
      </View>
      <View style={[styles.box, selected && styles.boxOn]}>
        {selected ? <Icon name="checkmark" size={16} color={colors.white} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    padding: 18,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
  },
  selected: { borderColor: colors.primaryTint },
  emoji: { fontSize: 22, marginTop: 2 },
  texts: { flex: 1, gap: 6 },
  sample: { fontStyle: 'italic', marginTop: 4 },
  box: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary },
});
