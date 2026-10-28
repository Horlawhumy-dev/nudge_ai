import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';

import { BottomSheet, Button, Chip, SelectField, Text, TextField, Toggle } from '@/components/ui';
import { HABIT_NAME_MAX, validateHabitName } from '@/lib/validation';
import { toast } from '@/store/useToastStore';
import { useHabitsStore } from '@/store/useHabitsStore';
import { usePreferencesStore } from '@/store/usePreferencesStore';
import { colors, radius } from '@/theme';

import { FREQUENCIES, HABIT_CATEGORIES, HABIT_ICONS, TIMES_OF_DAY } from '../constants';
import type { Habit, HabitFrequency, TimeOfDay } from '../types';

type HabitSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Pass a habit to edit it; omit to create. Give the sheet a `key` per habit so its form resets. */
  habit?: Habit;
};

const FREQUENCY_OPTIONS = FREQUENCIES.map((f) => ({ label: f, value: f }));

export function HabitSheet({ visible, onClose, habit }: HabitSheetProps) {
  const habits = useHabitsStore((s) => s.habits);
  const addHabit = useHabitsStore((s) => s.addHabit);
  const updateHabit = useHabitsStore((s) => s.updateHabit);
  const stackingEnabled = usePreferencesStore((s) => s.habitStacking);
  const editing = habit !== undefined;

  const [name, setName] = useState(habit?.name ?? '');
  const [emoji, setEmoji] = useState<string>(habit?.emoji ?? HABIT_ICONS[0]);
  const [category, setCategory] = useState<string>(habit?.category ?? HABIT_CATEGORIES[0]);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(habit?.timeOfDay ?? 'Morning');
  const [frequency, setFrequency] = useState<HabitFrequency>(habit?.frequency ?? 'Daily');
  const [stack, setStack] = useState(Boolean(habit?.stackedAfter));
  const [trigger, setTrigger] = useState<string | null>(habit?.stackedAfter ?? null);

  const candidates = habits.filter((h) => h.id !== habit?.id);
  const canStack = stackingEnabled && candidates.length > 0;
  const [touched, setTouched] = useState(false);
  const nameError = validateHabitName(
    name,
    candidates.map((h) => h.name)
  );
  const canSubmit = nameError === null;
  const triggerId = trigger ?? candidates[0]?.id ?? null;

  const reset = () => {
    if (editing) return;
    setName('');
    setTouched(false);
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
    if (!canSubmit) {
      setTouched(true);
      return;
    }
    const draft = {
      name: name.trim(),
      emoji,
      category,
      timeOfDay,
      frequency,
      stackedAfter: stack && canStack ? (triggerId ?? undefined) : undefined,
    };
    if (habit) {
      updateHabit(habit.id, draft);
      toast.success('Habit updated');
    } else {
      addHabit(draft);
      toast.success('Habit created');
    }
    close();
  };

  const triggerOptions = candidates.map((h) => ({ label: h.name, value: h.id }));
  const triggerName = candidates.find((h) => h.id === triggerId)?.name ?? 'your trigger habit';

  return (
    <BottomSheet
      visible={visible}
      title={editing ? 'Edit Habit' : 'Create New Habit'}
      onClose={close}
      footer={
        <Button
          label={editing ? 'Save changes' : 'Create habit'}
          onPress={submit}
          disabled={!canSubmit}
          testID="habit-submit"
        />
      }
    >
      <TextField
        appearance="filled"
        label="Habit Name"
        placeholder="e.g. morning workout"
        value={name}
        onChangeText={setName}
        onBlur={() => setTouched(true)}
        error={(touched || name.trim().length > 0) && nameError ? nameError : undefined}
        success={touched && !nameError}
        counter={`${name.trim().length}/${HABIT_NAME_MAX}`}
        autoFocus={!editing}
        maxLength={HABIT_NAME_MAX + 10}
        returnKeyType="done"
        onSubmitEditing={submit}
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
                value={triggerId}
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
