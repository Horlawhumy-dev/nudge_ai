import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionSheet } from '@/components/ui';
import { useNow } from '@/hooks/useNow';
import { haptics } from '@/lib/haptics';
import { toast } from '@/store/useToastStore';
import { useHabitsStore } from '@/store/useHabitsStore';

import { allDoneToday } from '../utils';
import type { Habit } from '../types';

import { HabitCard } from './HabitCard';
import { HabitSheet } from './HabitSheet';

type HabitListProps = {
  habits: readonly Habit[];
};

/** Habit cards plus their shared menu: open, edit, delete (with undo). */
export function HabitList({ habits }: HabitListProps) {
  const router = useRouter();
  useNow(); // re-render across midnight so "done today" resets
  const toggleHabit = useHabitsStore((s) => s.toggleHabit);
  const removeHabit = useHabitsStore((s) => s.removeHabit);
  const restoreHabit = useHabitsStore((s) => s.restoreHabit);
  const [menu, setMenu] = useState<Habit | null>(null);
  const [editing, setEditing] = useState<Habit | null>(null);

  const toggle = (habit: Habit) => {
    toggleHabit(habit.id);
    // Celebrate finishing the day's last habit.
    if (allDoneToday(useHabitsStore.getState().habits)) {
      haptics.success();
      toast.success('All habits done today. Nice work! 🎉');
    }
  };

  const remove = (habit: Habit) => {
    const removed = removeHabit(habit.id);
    if (!removed) return;
    haptics.warning();
    toast.show(`“${habit.name}” deleted`, {
      action: { label: 'Undo', onPress: () => restoreHabit(removed.habit, removed.index) },
    });
  };

  return (
    <>
      <View style={styles.list}>
        {habits.map((habit) => (
          <HabitCard
            key={habit.id}
            habit={habit}
            onToggle={() => toggle(habit)}
            onMenu={() => setMenu(habit)}
            onPress={() => router.push({ pathname: '/habit/[id]', params: { id: habit.id } })}
          />
        ))}
      </View>
      <ActionSheet
        visible={menu !== null}
        title={menu?.name ?? ''}
        onClose={() => setMenu(null)}
        actions={
          menu
            ? [
                {
                  label: 'View details',
                  icon: 'stats-chart-outline',
                  onPress: () => router.push({ pathname: '/habit/[id]', params: { id: menu.id } }),
                },
                { label: 'Edit habit', icon: 'create-outline', onPress: () => setEditing(menu) },
                {
                  label: 'Delete habit',
                  icon: 'trash-outline',
                  destructive: true,
                  onPress: () => remove(menu),
                },
              ]
            : []
        }
      />
      <HabitSheet
        key={editing?.id ?? 'none'}
        visible={editing !== null}
        habit={editing ?? undefined}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { gap: 14 },
});
