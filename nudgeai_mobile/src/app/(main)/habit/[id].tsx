import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  Icon,
  ProgressBar,
  Screen,
  ScreenHeader,
  Text,
} from '@/components/ui';
import { HabitSheet } from '@/features/habits/components/HabitSheet';
import {
  daysDone,
  habitProgress,
  habitStreak,
  isDoneToday,
  weekDots,
} from '@/features/habits/utils';
import { haptics } from '@/lib/haptics';
import { useHabitsStore } from '@/store/useHabitsStore';
import { toast } from '@/store/useToastStore';
import { colors, radius } from '@/theme';

export default function HabitDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const habit = useHabitsStore((s) => s.habits.find((h) => h.id === id));
  const allHabits = useHabitsStore((s) => s.habits);
  const toggleHabit = useHabitsStore((s) => s.toggleHabit);
  const removeHabit = useHabitsStore((s) => s.removeHabit);
  const restoreHabit = useHabitsStore((s) => s.restoreHabit);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!habit) {
    return (
      <Screen background={colors.background}>
        <ScreenHeader title="Habit" />
        <View style={styles.missing}>
          <EmptyState
            icon="leaf-outline"
            title="Habit not found"
            message="It may have been deleted."
            actionLabel="Back to habits"
            onAction={() => router.replace('/habits')}
          />
        </View>
      </Screen>
    );
  }

  const accent = colors.accents[habit.accentIndex % colors.accents.length];
  const done = isDoneToday(habit);
  const streak = habitStreak(habit);
  const dots = weekDots(habit);
  const trigger = allHabits.find((h) => h.id === habit.stackedAfter);

  const remove = () => {
    setConfirmDelete(false);
    const removed = removeHabit(habit.id);
    router.back();
    if (removed) {
      haptics.warning();
      toast.show(`“${habit.name}” deleted`, {
        action: { label: 'Undo', onPress: () => restoreHabit(removed.habit, removed.index) },
      });
    }
  };

  return (
    <Screen
      scroll
      background={colors.background}
      contentStyle={styles.content}
      footer={
        <Button
          label={done ? 'Undo today’s check-in' : 'Mark done for today'}
          variant={done ? 'secondary' : 'primary'}
          onPress={() => {
            const nowDone = toggleHabit(habit.id);
            if (nowDone) toast.success('Checked in. Keep it going!');
          }}
          testID="habit-toggle"
        />
      }
    >
      <ScreenHeader
        title="Habit"
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit habit"
            hitSlop={10}
            onPress={() => setEditing(true)}
          >
            <Icon name="create-outline" size={26} />
          </Pressable>
        }
      />

      <Card padding={20} radiusSize="xl" style={styles.hero}>
        <View style={[styles.emojiTile, { backgroundColor: colors.fill }]}>
          <RNText style={styles.emoji}>{habit.emoji}</RNText>
        </View>
        <Text variant="heading" align="center">
          {habit.name}
        </Text>
        <View style={styles.tags}>
          <Chip label={habit.category} size="tag" selected />
          <Chip label={habit.timeOfDay} size="tag" tone="grey" />
          <Chip label={habit.frequency} size="tag" tone="grey" />
        </View>
        <View style={styles.progress}>
          <View style={styles.goal}>
            <Text variant="body" color={colors.textSecondary}>
              Last 7 days
            </Text>
            <Text variant="body" color={colors.textSecondary}>
              {daysDone(habit)}/{habit.goalDays} days
            </Text>
          </View>
          <ProgressBar progress={habitProgress(habit)} color={accent} />
        </View>
      </Card>

      <View style={styles.stats}>
        <Card padding={14} radiusSize="lg" style={styles.stat}>
          <Text variant="numeral">🔥 {streak}</Text>
          <Text variant="body" color={colors.textSecondary}>
            Day streak
          </Text>
        </Card>
        <Card padding={14} radiusSize="lg" style={styles.stat}>
          <Text variant="numeral">{habit.completions.length}</Text>
          <Text variant="body" color={colors.textSecondary}>
            Total check-ins
          </Text>
        </Card>
      </View>

      <Card padding={18} radiusSize="xl" style={styles.week}>
        <Text variant="bodyLarge" color={colors.textSecondary}>
          This week
        </Text>
        <View style={styles.dots}>
          {dots.map((d) => (
            <View
              key={d.key}
              style={styles.dotCol}
              accessibilityLabel={`${d.key}: ${d.done ? 'done' : 'not done'}`}
            >
              <View
                style={[
                  styles.dot,
                  d.done && { backgroundColor: colors.primary, borderColor: colors.primary },
                  d.isToday && !d.done && { borderColor: colors.primary },
                ]}
              >
                {d.done ? <Icon name="checkmark" size={16} color={colors.white} /> : null}
              </View>
              <Text variant="caption" color={d.isToday ? colors.primary : colors.textMuted}>
                {d.label}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {trigger ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace({ pathname: '/habit/[id]', params: { id: trigger.id } })}
        >
          <Card padding={16} radiusSize="lg" style={styles.stack}>
            <Icon name="link-outline" size={22} color={colors.primary} />
            <View style={styles.stackTexts}>
              <Text variant="subheading">Stacked habit</Text>
              <Text variant="body" color={colors.textSecondary}>
                Nudge reminds you right after “{trigger.name}”.
              </Text>
            </View>
            <Icon name="chevron-forward" size={20} color={colors.textSecondary} />
          </Card>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => setConfirmDelete(true)}
        style={styles.delete}
      >
        <Icon name="trash-outline" size={20} color={colors.danger} />
        <Text variant="subheading" color={colors.danger}>
          Delete habit
        </Text>
      </Pressable>

      <HabitSheet
        key={habit.id}
        visible={editing}
        habit={habit}
        onClose={() => setEditing(false)}
      />
      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this habit?"
        message={`“${habit.name}” and its history will be removed.`}
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingTop: 8 },
  missing: { flex: 1, justifyContent: 'center' },
  hero: { alignItems: 'center', gap: 12 },
  emojiTile: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 38 },
  tags: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  progress: { alignSelf: 'stretch', gap: 8, marginTop: 6 },
  goal: { flexDirection: 'row', justifyContent: 'space-between' },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  week: { gap: 14 },
  dots: { flexDirection: 'row', justifyContent: 'space-between' },
  dotCol: { alignItems: 'center', gap: 6 },
  dot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stack: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stackTexts: { flex: 1, gap: 2 },
  delete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.dangerSoft,
    marginTop: 8,
  },
});
