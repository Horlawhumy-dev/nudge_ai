import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTabBarClearance } from '@/components/layout/useTabBarClearance';
import { Button, EmptyState, Screen, Text } from '@/components/ui';
import { HabitSheet } from '@/features/habits/components/HabitSheet';
import { HabitList } from '@/features/habits/components/HabitList';
import { allDoneToday, completedCount } from '@/features/habits/utils';
import { AskNudgeBar, ASK_BAR_HEIGHT } from '@/features/home/components/AskNudgeBar';
import { HomeHeader } from '@/features/home/components/HomeHeader';
import { ListSection } from '@/features/home/components/ListSection';
import { NudgeBanner } from '@/features/home/components/NudgeBanner';
import { ProgressCard } from '@/features/home/components/ProgressCard';
import { TaskList } from '@/features/tasks/components/TaskList';
import { TaskSheet } from '@/features/tasks/components/TaskSheet';
import { doneCount, isForToday } from '@/features/tasks/utils';
import { unreadCount } from '@/features/notifications/utils';
import { useNow } from '@/hooks/useNow';
import { greeting } from '@/lib/format';
import { displayName, useAuthStore } from '@/store/useAuthStore';
import { overallStreak } from '@/features/habits/streak';
import { useHabitsStore } from '@/store/useHabitsStore';
import { useNotificationsStore } from '@/store/useNotificationsStore';
import { useTasksStore } from '@/store/useTasksStore';
import { colors } from '@/theme';

export default function Home() {
  const clearance = useTabBarClearance();
  const name = useAuthStore((s) => displayName(s.user));
  const habits = useHabitsStore((s) => s.habits);
  const streak = overallStreak(habits);
  const tasks = useTasksStore((s) => s.tasks);
  const unread = useNotificationsStore((s) => unreadCount(s.items));
  const [habitSheet, setHabitSheet] = useState(false);
  const [taskSheet, setTaskSheet] = useState(false);

  const isEmpty = habits.length === 0 && tasks.length === 0;
  const now = useNow();
  const todayTasks = tasks
    .filter((t) => isForToday(t, now))
    .sort((a, b) => Number(b.done) - Number(a.done));
  const message = allDoneToday(habits)
    ? `All habits done today, ${name}. Amazing work! 🎉`
    : streak > 0
      ? `Deep work in 10 mins. You’re on a ${streak}-day streak. Keep going ${name}.`
      : `Let’s start your first streak today, ${name}.`;

  return (
    <Screen
      scroll
      background={colors.background}
      bottomInset={clearance + ASK_BAR_HEIGHT + 8}
      contentStyle={styles.content}
      overlay={<AskNudgeBar bottom={clearance - 8} />}
    >
      <HomeHeader greeting={greeting(name, now)} streak={streak} unread={unread} />

      {isEmpty ? (
        <View style={styles.empty}>
          <EmptyState
            icon="sparkles-outline"
            title="Your day starts here"
            message="Add your first habit and Nudge will take care of the rest."
            actionLabel="+  Add first habit"
            onAction={() => setHabitSheet(true)}
            footnote="Your AI is ready and listening."
          />
        </View>
      ) : (
        <>
          <NudgeBanner message={message} />
          <View style={styles.progress}>
            <Text variant="subheading">Today’s progress</Text>
            <View style={styles.cards}>
              <ProgressCard
                done={completedCount(habits)}
                total={habits.length}
                label="Habits done"
                color={colors.accents[0]}
              />
              <ProgressCard
                done={doneCount(todayTasks)}
                total={todayTasks.length}
                label="Tasks done"
                color={colors.accents[1]}
              />
            </View>
          </View>
          <ListSection
            title="Today’s Habits"
            addLabel="Add habit"
            onAdd={() => setHabitSheet(true)}
          >
            {habits.length > 0 ? (
              <HabitList habits={habits} />
            ) : (
              <Button label="Add a habit" variant="outline" onPress={() => setHabitSheet(true)} />
            )}
          </ListSection>
          <ListSection title="To-do list" addLabel="Add task" onAdd={() => setTaskSheet(true)}>
            {todayTasks.length > 0 ? (
              <TaskList tasks={todayTasks} />
            ) : (
              <Button label="Add a task" variant="outline" onPress={() => setTaskSheet(true)} />
            )}
          </ListSection>
        </>
      )}

      <HabitSheet visible={habitSheet} onClose={() => setHabitSheet(false)} />
      <TaskSheet visible={taskSheet} onClose={() => setTaskSheet(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 22, paddingTop: 8 },
  empty: { flex: 1, justifyContent: 'center', paddingBottom: 120 },
  progress: { gap: 14 },
  cards: { flexDirection: 'row', gap: 14 },
});
