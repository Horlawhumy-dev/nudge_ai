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
import {
  buildConsistencyMap,
  habitBars,
  habitInsight,
  habitOverview,
  overdueTasks,
  taskBars,
  taskInsight,
  taskOverview,
  topHabits,
  topTaskGroups,
} from '@/features/progress/data';
import type { ProgressPeriod, ProgressTab } from '@/features/progress/types';
import { useHabitsStore } from '@/store/useHabitsStore';
import { colors, fonts } from '@/theme';

const TABS = [
  { key: 'habits', label: 'Habits' },
  { key: 'tasks', label: 'Tasks' },
] as const;

function monthMap(today: Date) {
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return buildConsistencyMap(daysInMonth, today.getDate() - 1);
}

export default function Progress() {
  const router = useRouter();
  const clearance = useTabBarClearance();
  const hasData = useHabitsStore((s) => s.habits.length > 0);
  const [tab, setTab] = useState<ProgressTab>('habits');
  const [period, setPeriod] = useState<ProgressPeriod>('Weekly');
  const span = period === 'Weekly' ? 'week' : 'month';
  const today = new Date();

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

      {!hasData ? (
        <Card style={styles.sample}>
          <Text variant="body" color={colors.textSecondary} align="center">
            Sample data. Your own progress appears here once you complete habits and tasks.
          </Text>
        </Card>
      ) : null}

      <View style={styles.overviewHead}>
        <Text variant="heading" style={styles.overviewTitle}>
          Overview
        </Text>
        <PeriodPill value={period} onChange={setPeriod} />
      </View>

      {tab === 'habits' ? (
        <>
          <View style={styles.row}>
            <StatCard prefix="🔥" value={String(habitOverview.streak)} label="Day streak" />
            <StatCard value={`${habitOverview.consistency}%`} label="Consistency" />
            <StatCard value={String(habitOverview.allTimeWins)} label="All time win" />
          </View>
          <Card padding={16} radiusSize="xl" style={styles.chart}>
            <Text variant="bodyLarge" color={colors.textSecondary}>
              Habits completed this {span}
            </Text>
            <BarChart data={habitBars[period]} />
          </Card>
          <InsightCard
            message={habitInsight}
            prompt="Tell me more about my habit insights and how to improve."
          />
          <Card padding={14} radiusSize="xl" style={styles.list}>
            <Text variant="bodyLarge" color={colors.textSecondary} style={styles.listTitle}>
              Top performing habits
            </Text>
            {topHabits.map((h) => (
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
          <ConsistencyMap days={monthMap(today)} today={today} />
        </>
      ) : (
        <>
          <View style={styles.row}>
            <StatCard value={`${taskOverview.done}/${taskOverview.total}`} label="Tasks" />
            <StatCard value={`${taskOverview.completionRate}%`} label="Completion rate" />
          </View>
          <View style={styles.row}>
            <StatCard value={`${taskOverview.onTimeRate}%`} label="One-time rate" />
            <StatCard
              value={String(taskOverview.overdue)}
              label="Overdue"
              valueColor={colors.danger}
            />
          </View>
          <Card padding={16} radiusSize="xl" style={styles.chart}>
            <Text variant="bodyLarge" color={colors.textSecondary}>
              Tasks completed this {span}
            </Text>
            <BarChart data={taskBars[period]} />
          </Card>
          <Card padding={14} radiusSize="xl" style={styles.list}>
            <Text variant="bodyLarge" color={colors.textSecondary} style={styles.listTitle}>
              Top performing tasks
            </Text>
            {topTaskGroups.map((g) => (
              <RankRow
                key={g.id}
                emoji={g.emoji}
                title={g.name}
                completion={g.completion}
                ringColor={colors.accents[g.accentIndex % colors.accents.length]}
              />
            ))}
          </Card>
          <InsightCard
            message={taskInsight}
            prompt="Tell me more about my task insights and how to plan my day."
          />
          <Card padding={14} radiusSize="xl" style={styles.list}>
            <Text variant="bodyLarge" color={colors.textSecondary} style={styles.listTitle}>
              Most overdue tasks
            </Text>
            {overdueTasks.map((t) => (
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
      )}
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
