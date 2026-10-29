import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTabBarClearance } from '@/components/layout/useTabBarClearance';
import { AskNudgeButton } from '@/features/home/components/AskNudgeButton';
import { EmptyState, Fab, Screen, ScreenHeader } from '@/components/ui';
import { FilterBar } from '@/features/habits/components/FilterBar';
import { StatPill } from '@/features/habits/components/StatPill';
import { TaskList } from '@/features/tasks/components/TaskList';
import { TaskSheet } from '@/features/tasks/components/TaskSheet';
import { TaskSectionHeader } from '@/features/tasks/components/TaskSectionHeader';
import type { TaskFilter } from '@/features/tasks/types';
import {
  doneCount,
  groupTasks,
  isForToday,
  isVisible,
  limitSections,
  matchesFilter,
} from '@/features/tasks/utils';
import { SeeMore } from '@/features/home/components/SeeMore';
import { PAGE_SIZE } from '@/hooks/usePaging';
import { useNow } from '@/hooks/useNow';
import { formatLongDate } from '@/lib/format';
import { useTasksStore } from '@/store/useTasksStore';
import { colors } from '@/theme';
import { refreshData } from '@/services/sync';

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
  const [filter, setFilter] = useState<TaskFilter>('All');
  const [sheet, setSheet] = useState(false);

  const now = useNow();
  const visible = tasks.filter((t) => isVisible(t, now));
  const all = groupTasks(
    visible.filter((t) => matchesFilter(t, filter, now)),
    now
  );
  const total = all.reduce((n, s) => n + s.tasks.length, 0);
  const [shown, setShown] = useState({ filter, count: PAGE_SIZE });
  const count = shown.filter === filter ? shown.count : PAGE_SIZE;
  const sections = limitSections(all, count);
  const today = tasks.filter((t) => isForToday(t, now));
  const done = doneCount(today);

  return (
    <Screen
      scroll
      onRefresh={refreshData}
      background={colors.background}
      bottomInset={clearance + 40}
      contentStyle={styles.content}
      overlay={
        <>
          <Fab
            accessibilityLabel="Add task"
            onPress={() => setSheet(true)}
            bottom={clearance - 8}
          />
          <AskNudgeButton bottom={clearance - 8} aboveFab />
        </>
      }
    >
      <ScreenHeader
        title="My Tasks"
        subtitle={formatLongDate(now)}
        onBack={() => router.navigate('/home')}
        right={<StatPill emoji={moodEmoji(done, today.length)} label={`${done}/${today.length}`} />}
      />
      <FilterBar filters={FILTERS} value={filter} onChange={setFilter} />
      {sections.length > 0 ? (
        sections.map((section) => (
          <TaskList
            key={section.status}
            tasks={section.tasks}
            header={<TaskSectionHeader status={section.status} title={section.title} />}
          />
        ))
      ) : (
        <View style={styles.empty}>
          <EmptyState
            icon="clipboard-outline"
            title={visible.length === 0 ? 'No tasks yet' : `No ${filter.toLowerCase()} tasks`}
            message="Tap + to add a task and Nudge will remind you when it’s time."
          />
        </View>
      )}
      <SeeMore
        remaining={total - count}
        noun="tasks"
        onPress={() => setShown({ filter, count: count + PAGE_SIZE })}
      />
      <TaskSheet visible={sheet} onClose={() => setSheet(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20, paddingTop: 8 },
  section: { gap: 12 },
  empty: { marginTop: 60 },
});
