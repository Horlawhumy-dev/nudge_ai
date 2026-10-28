import { useRouter } from 'expo-router';
import { StyleSheet, Text as RNText, View } from 'react-native';

import {
  Button,
  Card,
  GradientCard,
  ProgressRing,
  Screen,
  ScreenHeader,
  Text,
} from '@/components/ui';
import { buildWeeklyReport, reportRange } from '@/features/reports/weekly';
import { useNow } from '@/hooks/useNow';
import { useHabitsStore } from '@/store/useHabitsStore';
import { useTasksStore } from '@/store/useTasksStore';
import { colors } from '@/theme';

export default function WeeklyReport() {
  const router = useRouter();
  const now = useNow();
  const habits = useHabitsStore((s) => s.habits);
  const tasks = useTasksStore((s) => s.tasks);
  const report = buildWeeklyReport(habits, tasks, now);

  const highlights = [
    report.bestDay && {
      emoji: '🏆',
      label: 'Strongest day',
      value: `${report.bestDay.name} · ${report.bestDay.count} check-in${report.bestDay.count === 1 ? '' : 's'}`,
    },
    report.topHabit && { emoji: '⭐', label: 'Top habit', value: report.topHabit },
    report.needsLove && { emoji: '🌱', label: 'Needs some love', value: report.needsLove },
  ].filter((h): h is { emoji: string; label: string; value: string } => Boolean(h));

  return (
    <Screen
      scroll
      background={colors.background}
      contentStyle={styles.content}
      footer={
        <Button
          label="Ask Nudge about my week"
          onPress={() =>
            router.push({
              pathname: '/chat',
              params: { prompt: 'Give me a summary of my week and what to focus on next.' },
            })
          }
        />
      }
    >
      <ScreenHeader title="Weekly report" subtitle={reportRange(now)} />

      <Card padding={22} radiusSize="xl" style={styles.hero}>
        <ProgressRing
          progress={report.habitRate / 100}
          size={132}
          strokeWidth={12}
          color={colors.primary}
          label={`${report.habitRate}%`}
        />
        <Text variant="heading" align="center" style={styles.headline}>
          {report.headline}
        </Text>
        <Text variant="body" color={colors.textSecondary} align="center">
          Habit check-ins against your weekly goals
        </Text>
      </Card>

      <View style={styles.row}>
        <Card padding={14} radiusSize="lg" style={styles.stat}>
          <Text variant="numeral">
            {report.checkIns}/{report.possible}
          </Text>
          <Text variant="body" color={colors.textSecondary}>
            Habit check-ins
          </Text>
        </Card>
        <Card padding={14} radiusSize="lg" style={styles.stat}>
          <Text variant="numeral">
            {report.tasksDone}/{report.tasksTotal}
          </Text>
          <Text variant="body" color={colors.textSecondary}>
            Tasks done
          </Text>
        </Card>
      </View>

      {highlights.length > 0 ? (
        <Card padding={18} radiusSize="xl" style={styles.list}>
          <Text variant="bodyLarge" color={colors.textSecondary}>
            Highlights
          </Text>
          {highlights.map((h) => (
            <View key={h.label} style={styles.highlight}>
              <View style={styles.tile}>
                <RNText style={styles.emoji}>{h.emoji}</RNText>
              </View>
              <View style={styles.texts}>
                <Text variant="body" color={colors.textSecondary}>
                  {h.label}
                </Text>
                <Text variant="subheading">{h.value}</Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <GradientCard variant="card" style={styles.tips}>
        <Text variant="heading" color={colors.white}>
          Nudge suggests
        </Text>
        {report.tips.map((tip) => (
          <View key={tip} style={styles.tip}>
            <Text variant="bodyLarge" color={colors.white}>
              •
            </Text>
            <Text variant="bodyLarge" color="rgba(255,255,255,0.95)" style={styles.tipText}>
              {tip}
            </Text>
          </View>
        ))}
      </GradientCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingTop: 8 },
  hero: { alignItems: 'center', gap: 8 },
  headline: { marginTop: 12 },
  row: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  list: { gap: 14 },
  highlight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 22 },
  texts: { flex: 1, gap: 2 },
  tips: { gap: 10, padding: 20 },
  tip: { flexDirection: 'row', gap: 10 },
  tipText: { flex: 1 },
});
