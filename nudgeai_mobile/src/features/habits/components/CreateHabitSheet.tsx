import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';

import { BottomSheet, Button, Chip, SelectField, Text, TextField, Toggle } from '@/components/ui';
import { useHabitsStore } from '@/store/useHabitsStore';
import { usePreferencesStore } from '@/store/usePreferencesStore';
import { colors, radius } from '@/theme';

import { FREQUENCIES, HABIT_CATEGORIES, HABIT_ICONS, TIMES_OF_DAY } from '../constants';
import type { HabitFrequency, TimeOfDay } from '../types';

type CreateHabitSheetProps = {
  visible: boolean;
  onClose: () => void;
};

const FREQUENCY_OPTIONS = FREQUENCIES.map((f) => ({ label: f, value: f }));

export function CreateHabitSheet({ visible, onClose }: CreateHabitSheetProps) {
  const habits = useHabitsStore((s) => s.habits);
  const addHabit = useHabitsStore((s) => s.addHabit);
  const stackingEnabled = usePreferencesStore((s) => s.habitStacking);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string>(HABIT_ICONS[0]);
  const [category, setCategory] = useState<string>(HABIT_CATEGORIES[0]);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('Morning');
  const [frequency, setFrequency] = useState<HabitFrequency>('Daily');
  const [stack, setStack] = useState(false);
  const [trigger, setTrigger] = useState<string | null>(null);

  const canStack = stackingEnabled && habits.length > 0;
  const canSubmit = name.trim().length > 0;

  const reset = () => {
    setName('');
    setEmoji(HABIT_ICONS[0]);
    setCategory(HABIT_CATEGORIES[0]);
    setTimeOfDay('Morning');
    setFrequency('Daily');
    setStack(false);
    setTrigger(null);
  };

  const close = () => {
    onClose();
    reset();
  };

  const submit = () => {
    if (!canSubmit) return;
    addHabit({
      name: name.trim(),
      emoji,
      category,
      timeOfDay,
      frequency,
      stackedAfter: stack ? (trigger ?? habits[0]?.id) : undefined,
    });
    close();
  };

  const triggerOptions = habits.map((h) => ({ label: h.name, value: h.id }));
  const triggerName =
    habits.find((h) => h.id === (trigger ?? habits[0]?.id))?.name ?? 'your trigger habit';

  return (
    <BottomSheet
      visible={visible}
      title="Create New Habit"
      onClose={close}
      footer={
        <Button
          label="Create habit"
          onPress={submit}
          disabled={!canSubmit}
          testID="create-habit-submit"
        />
      }
    >
      <TextField
        appearance="filled"
        label="Habit Name"
        placeholder="e.g. morning workout"
        value={name}
        onChangeText={setName}
      />

      <View style={styles.group}>
        <Text variant="subheading" color={colors.textSecondary}>
          Choose Icon
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.icons}
        >
          {HABIT_ICONS.map((icon) => (
            <Pressable
              key={icon}
              accessibilityRole="button"
              accessibilityState={{ selected: icon === emoji }}
              onPress={() => setEmoji(icon)}
              style={[styles.icon, icon === emoji && { backgroundColor: colors.primaryTint }]}
            >
              <RNText style={styles.iconText}>{icon}</RNText>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.group}>
        <Text variant="subheading" color={colors.textSecondary}>
          Category
        </Text>
        <View style={styles.grid}>
          {HABIT_CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={c}
              tone="grey"
              selected={c === category}
              onPress={() => setCategory(c)}
              style={styles.gridChip}
            />
          ))}
        </View>
      </View>

      <View style={styles.group}>
        <Text variant="subheading" color={colors.textSecondary}>
          Time of the day
        </Text>
        <View style={styles.row}>
          {TIMES_OF_DAY.map((t) => (
            <Chip
              key={t.value}
              label={t.value}
              tone="grey"
              selected={t.value === timeOfDay}
              onPress={() => setTimeOfDay(t.value)}
              leading={<RNText style={styles.chipEmoji}>{t.emoji}</RNText>}
              style={styles.rowChip}
            />
          ))}
        </View>
      </View>

      <SelectField
        label="Frequency"
        value={frequency}
        options={FREQUENCY_OPTIONS}
        onChange={setFrequency}
      />

      {canStack ? (
        <View style={styles.stackCard}>
          <View style={styles.stackHead}>
            <View style={styles.stackTexts}>
              <Text variant="subheading">Stack this habit</Text>
              <Text variant="body" color={colors.textSecondary}>
                Attach to an existing habit
              </Text>
            </View>
            <Toggle value={stack} onValueChange={setStack} accessibilityLabel="Stack this habit" />
          </View>
          {stack ? (
            <View style={styles.stackBody}>
              <SelectField
                nested
                label="Trigger after"
                value={trigger ?? habits[0]?.id ?? null}
                options={triggerOptions}
                onChange={setTrigger}
              />
              <Text variant="body" color={colors.textSecondary}>
                Nudge will remind you immediately after you complete {triggerName}.
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  group: { gap: 12 },
  icons: { gap: 12, paddingRight: 8 },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 26 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridChip: { height: 46, borderRadius: radius.md, minWidth: '30%', flexGrow: 1 },
  row: { flexDirection: 'row', gap: 12 },
  rowChip: { flex: 1, height: 46, borderRadius: radius.md, paddingHorizontal: 8 },
  chipEmoji: { fontSize: 16 },
  stackCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 18,
    gap: 16,
  },
  stackHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stackTexts: { flex: 1, gap: 2 },
  stackBody: {
    gap: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 16,
  },
});
