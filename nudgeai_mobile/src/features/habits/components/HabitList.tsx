import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConfirmDialog } from '@/components/ui';
import { useHabitsStore } from '@/store/useHabitsStore';

import type { Habit } from '../types';

import { HabitCard } from './HabitCard';

type HabitListProps = {
  habits: readonly Habit[];
};

/** Habit cards plus the shared "delete habit" confirmation. */
export function HabitList({ habits }: HabitListProps) {
  const toggleHabit = useHabitsStore((s) => s.toggleHabit);
  const removeHabit = useHabitsStore((s) => s.removeHabit);
  const [pending, setPending] = useState<Habit | null>(null);

  return (
    <>
      <View style={styles.list}>
        {habits.map((habit) => (
          <HabitCard
            key={habit.id}
            habit={habit}
            onToggle={() => toggleHabit(habit.id)}
            onMenu={() => setPending(habit)}
          />
        ))}
      </View>
      <ConfirmDialog
        visible={pending !== null}
        title="Delete this habit?"
        message={pending ? `“${pending.name}” and its progress will be removed.` : undefined}
        confirmLabel="Delete"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) removeHabit(pending.id);
          setPending(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { gap: 14 },
});
