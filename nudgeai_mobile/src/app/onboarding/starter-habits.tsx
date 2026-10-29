import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { BackButton, Button, Screen, Text } from '@/components/ui';
import { Checkbox } from '@/features/habits/components/Checkbox';
import { FREE_HABIT_LIMIT } from '@/features/habits/constants';
import { habitRoom } from '@/features/habits/utils';
import { DEFAULT_SELECTED, suggestHabits } from '@/features/onboarding/suggestions';
import { haptics } from '@/lib/haptics';
import { useHabitsStore } from '@/store/useHabitsStore';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { usePreferencesStore } from '@/store/usePreferencesStore';
import { toast } from '@/store/useToastStore';
import { colors, radius } from '@/theme';

/** Turns the goals picked in setup into real habits, so Home isn't empty on day one. */
export default function StarterHabits() {
  const router = useRouter();
  const goals = useOnboardingStore((s) => s.goals);
  const addHabit = useHabitsStore((s) => s.addHabit);
  const existing = useHabitsStore((s) => s.habits.length);
  const plan = usePreferencesStore((s) => s.plan);
  // The Free plan holds 3 habits; the server refuses more, so stop the selection there instead
  // of letting someone tick ten and fail on seven.
  const room = habitRoom(plan, existing);
  const suggestions = suggestHabits(goals);
  const [selected, setSelected] = useState<string[]>(() =>
    suggestHabits(goals)
      .slice(0, Math.min(DEFAULT_SELECTED, room))
      .map((s) => s.id)
  );

  const toggle = (id: string) => {
    if (!selected.includes(id) && selected.length >= room) {
      haptics.warning();
      toast.show(
        `Free includes ${FREE_HABIT_LIMIT} habits. Untick one to pick another, or get Pro for more.`
      );
      return;
    }
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  };

  const next = () => router.replace('/onboarding/ready');

  const add = () => {
    const chosen = suggestions.filter((s) => selected.includes(s.id));
    chosen.forEach(({ name, emoji, category, timeOfDay, frequency }) =>
      addHabit({ name, emoji, category, timeOfDay, frequency })
    );
    haptics.success();
    toast.success(`${chosen.length} habit${chosen.length === 1 ? '' : 's'} added`);
    next();
  };

  return (
    <Screen
      scroll
      footer={
        <View style={styles.footer}>
          <Button
            label={
              selected.length > 0
                ? `Add ${selected.length} habit${selected.length === 1 ? '' : 's'}`
                : 'Add habits'
            }
            onPress={add}
            disabled={selected.length === 0}
            testID="add-starter-habits"
          />
          <Button label="Skip for now" variant="ghost" onPress={next} />
        </View>
      }
    >
      <BackButton />
      <View style={styles.heading}>
        <Text variant="title">Start with a few habits</Text>
        <Text variant="bodyLarge" color={colors.textSecondary} style={styles.subtitle}>
          Based on what you’re working on. Pick the ones you’d like, you can change them anytime.
        </Text>
        {Number.isFinite(room) ? (
          <Text variant="caption" color={colors.textMuted} style={styles.limit}>
            {selected.length} of {room} selected · Free includes {FREE_HABIT_LIMIT} habits
          </Text>
        ) : null}
      </View>

      <View style={styles.list}>
        {suggestions.map((s) => {
          const on = selected.includes(s.id);
          return (
            <Pressable
              key={s.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${s.name}, ${s.timeOfDay}`}
              onPress={() => toggle(s.id)}
              style={[styles.card, on && styles.cardOn]}
            >
              <View style={styles.emojiTile}>
                <RNText style={styles.emoji}>{s.emoji}</RNText>
              </View>
              <View style={styles.texts}>
                <Text variant="subheading">{s.name}</Text>
                <Text variant="body" color={colors.textSecondary}>
                  {s.category} · {s.timeOfDay} · Daily
                </Text>
              </View>
              <Checkbox
                checked={on}
                onPress={() => toggle(s.id)}
                accessibilityLabel={`Select ${s.name}`}
              />
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { marginTop: 28, marginBottom: 24 },
  subtitle: { marginTop: 8 },
  limit: { marginTop: 10 },
  list: { gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  cardOn: { backgroundColor: colors.primarySoft, borderColor: colors.primaryTint },
  emojiTile: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 24 },
  texts: { flex: 1, gap: 2 },
  footer: { gap: 4 },
});
