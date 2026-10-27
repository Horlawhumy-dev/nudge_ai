import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTabBarClearance } from '@/components/layout/useTabBarClearance';
import { Button, EmptyState, Screen, Text } from '@/components/ui';
import { CreateHabitSheet } from '@/features/habits/components/CreateHabitSheet';
import { HabitList } from '@/features/habits/components/HabitList';
import { completedCount } from '@/features/habits/utils';
import { AskNudgeButton } from '@/features/home/components/AskNudgeButton';
import { HomeHeader } from '@/features/home/components/HomeHeader';
import { ListSection } from '@/features/home/components/ListSection';
import { NudgeBanner } from '@/features/home/components/NudgeBanner';
import { ProgressCard } from '@/features/home/components/ProgressCard';
import { NewTaskSheet } from '@/features/tasks/components/NewTaskSheet';
import { TaskRow } from '@/features/tasks/components/TaskRow';
import { doneCount } from '@/features/tasks/utils';
import { firstName, greeting } from '@/lib/format';
import { useAuthStore } from '@/store/useAuthStore';
import { useHabitsStore } from '@/store/useHabitsStore';
import { useTasksStore } from '@/store/useTasksStore';
import { colors } from '@/theme';

const UNREAD_NUDGES = 3;

export default function Home() {
  const clearance = useTabBarClearance();
  const name = useAuthStore((s) => firstName(s.user?.name ?? ''));
  const habits = useHabitsStore((s) => s.habits);
  const streak = useHabitsStore((s) => s.streak);
  const tasks = useTasksStore((s) => s.tasks);
  const toggleTask = useTasksStore((s) => s.toggleTask);
  const [habitSheet, setHabitSheet] = useState(false);
  const [taskSheet, setTaskSheet] = useState(false);

  const isEmpty = habits.length === 0 && tasks.length === 0;
  const orderedTasks = [...tasks].sort((a, b) => Number(b.done) - Number(a.done));
  const message =
    streak > 0
      ? `Deep work in 10 mins. You’re on a ${streak}-day streak. Keep going ${name}.`
      : `Let’s start your first streak today, ${name}.`;

  return (
    <Screen
      scroll
      background={colors.background}
      bottomInset={clearance}
      contentStyle={styles.content}
      overlay={<AskNudgeButton bottom={clearance - 8} expanded={isEmpty} />}
    >
      <HomeHeader greeting={greeting(name)} streak={streak} unread={isEmpty ? 0 : UNREAD_NUDGES} />

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
              <ProgressCard done={completedCount(habits)} total={habits.length} label="Habits done" color={colors.accents[0]} />
              <ProgressCard done={doneCount(tasks)} total={tasks.length} label="Tasks done" color={colors.accents[1]} />
            </View>
          </View>
          <ListSection title="Today’s Habits" addLabel="Add habit" onAdd={() => setHabitSheet(true)}>
            {habits.length > 0 ? (
              <HabitList habits={habits} />
            ) : (
              <Button label="Add a habit" variant="outline" onPress={() => setHabitSheet(true)} />
            )}
          </ListSection>
          <ListSection title="To-do list" addLabel="Add task" onAdd={() => setTaskSheet(true)}>
            {orderedTasks.length > 0 ? (
              orderedTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => toggleTask(task.id)} />)
            ) : (
              <Button label="Add a task" variant="outline" onPress={() => setTaskSheet(true)} />
            )}
          </ListSection>
        </>
      )}

      <CreateHabitSheet visible={habitSheet} onClose={() => setHabitSheet(false)} />
      <NewTaskSheet visible={taskSheet} onClose={() => setTaskSheet(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 22, paddingTop: 8 },
  empty: { flex: 1, justifyContent: 'center', paddingBottom: 120 },
  progress: { gap: 14 },
  cards: { flexDirection: 'row', gap: 14 },
});
