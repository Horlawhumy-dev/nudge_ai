import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTabBarClearance } from '@/components/layout/useTabBarClearance';
import { EmptyState, Fab, Screen, ScreenHeader } from '@/components/ui';
import { HABIT_FILTERS, type HabitFilter } from '@/features/habits/constants';
import { CreateHabitSheet } from '@/features/habits/components/CreateHabitSheet';
import { FilterBar } from '@/features/habits/components/FilterBar';
import { HabitList } from '@/features/habits/components/HabitList';
import { StatPill } from '@/features/habits/components/StatPill';
import { useHabitsStore } from '@/store/useHabitsStore';
import { colors } from '@/theme';

export default function Habits() {
  const router = useRouter();
  const clearance = useTabBarClearance();
  const habits = useHabitsStore((s) => s.habits);
  const streak = useHabitsStore((s) => s.streak);
  const [filter, setFilter] = useState<HabitFilter>('All');
  const [sheet, setSheet] = useState(false);

  const visible = filter === 'All' ? habits : habits.filter((h) => h.timeOfDay === filter);

  return (
    <Screen
      scroll
      background={colors.background}
      bottomInset={clearance + 40}
      contentStyle={styles.content}
      overlay={
        <Fab
          accessibilityLabel="Create habit"
          onPress={() => setSheet(true)}
          bottom={clearance - 8}
        />
      }
    >
      <ScreenHeader
        title="My Habits"
        subtitle="Building consistency"
        onBack={() => router.navigate('/home')}
        right={<StatPill emoji="🔥" label={`${streak} days streak`} />}
      />
      <FilterBar filters={HABIT_FILTERS} value={filter} onChange={setFilter} />
      {visible.length > 0 ? (
        <HabitList habits={visible} />
      ) : (
        <View style={styles.empty}>
          <EmptyState
            icon="leaf-outline"
            title={habits.length === 0 ? 'No habits yet' : `No ${filter.toLowerCase()} habits`}
            message="Tap + to create a habit and Nudge will remind you at the right time."
          />
        </View>
      )}
      <CreateHabitSheet visible={sheet} onClose={() => setSheet(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20, paddingTop: 8 },
  empty: { marginTop: 60 },
});
