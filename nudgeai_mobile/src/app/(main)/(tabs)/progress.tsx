import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { useTabBarClearance } from '@/components/layout/useTabBarClearance';
import { AskNudgeButton } from '@/features/home/components/AskNudgeButton';
import { Card, Icon, Screen, ScreenHeader, Text, UnderlineTabs } from '@/components/ui';
import { BarChart } from '@/features/progress/components/BarChart';
import { ConsistencyMap } from '@/features/progress/components/ConsistencyMap';
import { InsightCard } from '@/features/progress/components/InsightCard';
import { PeriodPill } from '@/features/progress/components/PeriodPill';
import { RankRow } from '@/features/progress/components/RankRow';
import { StatCard } from '@/features/progress/components/StatCard';
import type { ProgressPeriod, ProgressTab } from '@/features/progress/types';
import { useHabitProgress, useTaskProgress } from '@/features/progress/useProgress';
import { useHabitsStore } from '@/store/useHabitsStore';
import { colors, fonts } from '@/theme';

const TABS = [
  { key: 'habits', label: 'Habits' },
  { key: 'tasks', label: 'Tasks' },
] as const;

export default function Progress() {
  const router = useRouter();
  const clearance = useTabBarClearance();
  const hasData = useHabitsStore((s) => s.habits.length > 0);
  const [tab, setTab] = useState<ProgressTab>('habits');
  const [period, setPeriod] = useState<ProgressPeriod>('Weekly');
  const span = period === 'Weekly' ? 'week' : 'month';
  const today = new Date();
  const habitsView = useHabitProgress(period, today, tab === 'habits');
  const tasksView = useTaskProgress(period, tab === 'tasks');
  const habit = habitsView.data;
  const task = tasksView.data;
  const view = tab === 'habits' ? habitsView : tasksView;

  return (
    <Screen
      scroll
      background={colors.background}
      bottomInset={clearance}
      contentStyle={styles.content}
      overlay={<AskNudgeButton bottom={clearance - 8} />}
    >
      <ScreenHeader
        title="Progress"
        subtitle="Track your journey here"
        onBack={() => router.navigate('/home')}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Weekly report"
            hitSlop={10}
            onPress={() => router.push('/report')}
          >
            <Icon name="document-text-outline" size={26} />
          </Pressable>
        }
      />
      <UnderlineTabs tabs={TABS} value={tab} onChange={setTab} />

      {view.sample && !hasData ? (
        <Card style={styles.sample}>
          <Text variant="body" color={colors.textSecondary} align="center">
            Sample data. Your own progress appears here once you complete habits and tasks.
          </Text>
        </Card>
      ) : null}
      {view.error ? (
        <Card style={styles.sample}>
          <Text variant="body" color={colors.textSecondary} align="center">
            Couldn’t refresh your progress. Showing what we had.
          </Text>
        </Card>
      ) : null}

      <View style={styles.overviewHead}>
        <Text variant="heading" style={styles.overviewTitle}>
          Overview
        </Text>
        <PeriodPill value={period} onChange={setPeriod} />
      </View>

      {view.loading || !(tab === 'habits' ? habit : task) ? (
        <Card style={styles.sample}>
          <Text variant="body" color={colors.textSecondary} align="center">
            {view.error
              ? 'We couldn’t load your progress. Check your connection.'
              : 'Loading your progress…'}
          </Text>
        </Card>
      ) : tab === 'habits' && habit ? (
        <>
          <View style={styles.row}>
            <StatCard prefix="🔥" value={String(habit.overview.streak)} label="Day streak" />
            <StatCard value={`${habit.overview.consistency}%`} label="Consistency" />
            <StatCard value={String(habit.overview.allTimeWins)} label="All time win" />
          </View>
          <Card padding={16} radiusSize="xl" style={styles.chart}>
            <Text variant="bodyLarge" color={colors.textSecondary}>
              Habits completed this {span}
            </Text>
            <BarChart data={habit.bars} />
          </Card>
          {habit.insight ? (
            <InsightCard
              message={habit.insight}
              prompt="Tell me more about my habit insights and how to improve."
            />
          ) : null}
          <Card padding={14} radiusSize="xl" style={styles.list}>
            <Text variant="bodyLarge" color={colors.textSecondary} style={styles.listTitle}>
              Top performing habits
            </Text>
            {habit.topHabits.map((h) => (
              <RankRow
                key={h.id}
                emoji={h.emoji}
                title={h.name}
                subtitle={
                  <View style={styles.streakRow}>
                    <RNText>🔥</RNText>
                    <Text variant="body" color={colors.textSecondary}>
                      {h.streak} days streak
                    </Text>
                  </View>
                }
                completion={h.completion}
                ringColor={colors.accents[h.accentIndex % colors.accents.length]}
                ringCaption="Completion"
              />
            ))}
          </Card>
          <ConsistencyMap days={habit.map} today={today} />
        </>
      ) : task ? (
        <>
          <View style={styles.row}>
            <StatCard value={`${task.overview.done}/${task.overview.total}`} label="Tasks" />
            <StatCard value={`${task.overview.completionRate}%`} label="Completion rate" />
          </View>
          <View style={styles.row}>
            <StatCard value={`${task.overview.onTimeRate}%`} label="One-time rate" />
            <StatCard
              value={String(task.overview.overdue)}
              label="Overdue"
              valueColor={colors.danger}
            />
          </View>
          <Card padding={16} radiusSize="xl" style={styles.chart}>
            <Text variant="bodyLarge" color={colors.textSecondary}>
              Tasks completed this {span}
            </Text>
            <BarChart data={task.bars} />
          </Card>
          <Card padding={14} radiusSize="xl" style={styles.list}>
            <Text variant="bodyLarge" color={colors.textSecondary} style={styles.listTitle}>
              Top performing tasks
            </Text>
            {task.groups.map((g) => (
              <RankRow
                key={g.id}
                emoji={g.emoji}
                title={g.name}
                completion={g.completion}
                ringColor={colors.accents[g.accentIndex % colors.accents.length]}
              />
            ))}
          </Card>
          {task.insight ? (
            <InsightCard
              message={task.insight}
              prompt="Tell me more about my task insights and how to plan my day."
            />
          ) : null}
          <Card padding={14} radiusSize="xl" style={styles.list}>
            <Text variant="bodyLarge" color={colors.textSecondary} style={styles.listTitle}>
              Most overdue tasks
            </Text>
            {task.overdue.map((t) => (
              <RankRow
                key={t.id}
                icon={
                  <Icon
                    name={t.icon}
                    size={22}
                    color={t.icon === 'call' ? colors.danger : colors.textSecondary}
                  />
                }
                title={t.title}
                subtitle={
                  <Text variant="body" color={colors.danger}>
                    Overdue {t.times}x this week
                  </Text>
                }
                trailing={
                  <View style={styles.times}>
                    <Text variant="subheading" color={colors.danger}>
                      {t.times}x
                    </Text>
                  </View>
                }
              />
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, paddingTop: 8 },
  sample: { backgroundColor: colors.primarySoft, borderColor: colors.primaryTint },
  overviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  overviewTitle: { fontFamily: fonts.bodyMedium, fontSize: 18 },
  row: { flexDirection: 'row', gap: 12 },
  chart: { gap: 18 },
  list: { gap: 12 },
  listTitle: { marginLeft: 6, marginTop: 4 },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  times: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});
