import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTabBarClearance } from '@/components/layout/useTabBarClearance';
import { EmptyState, Fab, Screen, ScreenHeader } from '@/components/ui';
import { FilterBar } from '@/features/habits/components/FilterBar';
import { StatPill } from '@/features/habits/components/StatPill';
import { NewTaskSheet } from '@/features/tasks/components/NewTaskSheet';
import { TaskRow } from '@/features/tasks/components/TaskRow';
import { TaskSectionHeader } from '@/features/tasks/components/TaskSectionHeader';
import type { TaskFilter } from '@/features/tasks/types';
import { doneCount, groupTasks, matchesFilter } from '@/features/tasks/utils';
import { formatLongDate } from '@/lib/format';
import { useTasksStore } from '@/store/useTasksStore';
import { colors } from '@/theme';

const FILTERS: readonly TaskFilter[] = ['All', 'Completed', 'Upcoming', 'Overdue'];

function moodEmoji(done: number, total: number): string {
  if (total === 0) return '🙂';
  const ratio = done / total;
  return ratio >= 0.8 ? '😄' : ratio >= 0.5 ? '🙂' : '😒';
}

export default function Tasks() {
  const router = useRouter();
  const clearance = useTabBarClearance();
  const tasks = useTasksStore((s) => s.tasks);
  const toggleTask = useTasksStore((s) => s.toggleTask);
  const [filter, setFilter] = useState<TaskFilter>('All');
  const [sheet, setSheet] = useState(false);

  const sections = groupTasks(tasks.filter((t) => matchesFilter(t, filter)));
  const done = doneCount(tasks);

  return (
    <Screen
      scroll
      background={colors.background}
      bottomInset={clearance + 40}
      contentStyle={styles.content}
      overlay={
        <Fab accessibilityLabel="Add task" onPress={() => setSheet(true)} bottom={clearance - 8} />
      }
    >
      <ScreenHeader
        title="My Tasks"
        subtitle={formatLongDate()}
        onBack={() => router.navigate('/home')}
        right={<StatPill emoji={moodEmoji(done, tasks.length)} label={`${done}/${tasks.length}`} />}
      />
      <FilterBar filters={FILTERS} value={filter} onChange={setFilter} />
      {sections.length > 0 ? (
        sections.map((section) => (
          <View key={section.status} style={styles.section}>
            <TaskSectionHeader status={section.status} title={section.title} />
            {section.tasks.map((task) => (
              <TaskRow key={task.id} task={task} onToggle={() => toggleTask(task.id)} />
            ))}
          </View>
        ))
      ) : (
        <View style={styles.empty}>
          <EmptyState
            icon="clipboard-outline"
            title={tasks.length === 0 ? 'No tasks yet' : `No ${filter.toLowerCase()} tasks`}
            message="Tap + to add a task and Nudge will remind you when it’s time."
          />
        </View>
      )}
      <NewTaskSheet visible={sheet} onClose={() => setSheet(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20, paddingTop: 8 },
  section: { gap: 12 },
  empty: { marginTop: 60 },
});
