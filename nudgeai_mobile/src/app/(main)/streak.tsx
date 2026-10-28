import { useRouter } from 'expo-router';
import { StyleSheet, Text as RNText, View } from 'react-native';

import { Button, Card, Icon, ProgressBar, Screen, ScreenHeader, Text } from '@/components/ui';
import {
  bestStreak,
  MILESTONES,
  nextMilestone,
  overallStreak,
  weekActivity,
} from '@/features/habits/streak';
import { useNow } from '@/hooks/useNow';
import { useHabitsStore } from '@/store/useHabitsStore';
import { colors, fonts, radius } from '@/theme';

export default function Streak() {
  const router = useRouter();
  const now = useNow();
  const habits = useHabitsStore((s) => s.habits);
  const streak = overallStreak(habits, now);
  const best = Math.max(bestStreak(habits), streak);
  const next = nextMilestone(streak);
  const week = weekActivity(habits, now);
  const checkedInToday = week[week.length - 1].done;

  return (
    <Screen
      scroll
      background={colors.background}
      contentStyle={styles.content}
      footer={
        checkedInToday ? undefined : (
          <Button label="Check in a habit" onPress={() => router.navigate('/habits')} />
        )
      }
    >
      <ScreenHeader title="Your streak" subtitle="Days in a row you did something" />

      <Card padding={22} radiusSize="xl" style={styles.hero}>
        <RNText style={styles.flame}>🔥</RNText>
        <Text style={styles.number} accessibilityLabel={`${streak} day streak`}>
          {streak}
        </Text>
        <Text variant="subheading" color={colors.textSecondary}>
          {streak === 1 ? 'day streak' : 'day streak'}
        </Text>
        <Text variant="bodyLarge" color={colors.textSecondary} align="center" style={styles.lead}>
          {streak === 0
            ? 'Tick off a habit today to start your streak.'
            : checkedInToday
              ? 'You’ve checked in today. Nice work!'
              : 'Check in a habit today to keep it going.'}
        </Text>
        {next ? (
          <View style={styles.next}>
            <View style={styles.nextRow}>
              <Text variant="body" color={colors.textSecondary}>
                Next milestone: {next} days
              </Text>
              <Text variant="body" color={colors.textSecondary}>
                {next - streak} to go
              </Text>
            </View>
            <ProgressBar progress={streak / next} color={colors.primary} />
          </View>
        ) : null}
      </Card>

      <View style={styles.stats}>
        <Card padding={14} radiusSize="lg" style={styles.stat}>
          <Text variant="numeral">{best}</Text>
          <Text variant="body" color={colors.textSecondary}>
            Best streak
          </Text>
        </Card>
        <Card padding={14} radiusSize="lg" style={styles.stat}>
          <Text variant="numeral">{week.filter((d) => d.done).length}/7</Text>
          <Text variant="body" color={colors.textSecondary}>
            Active this week
          </Text>
        </Card>
      </View>

      <Card padding={18} radiusSize="xl" style={styles.week}>
        <Text variant="bodyLarge" color={colors.textSecondary}>
          This week
        </Text>
        <View style={styles.dots}>
          {week.map((d) => (
            <View
              key={d.key}
              style={styles.dotCol}
              accessibilityLabel={`${d.key}: ${d.done ? 'active' : 'no check-ins'}`}
            >
              <View
                style={[
                  styles.dot,
                  d.done && { backgroundColor: colors.primary, borderColor: colors.primary },
                  d.isToday && !d.done && { borderColor: colors.primary },
                ]}
              >
                {d.done ? <Icon name="checkmark" size={16} color={colors.white} /> : null}
              </View>
              <Text variant="caption" color={d.isToday ? colors.primary : colors.textMuted}>
                {d.label}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <Card padding={18} radiusSize="xl" style={styles.milestones}>
        <Text variant="bodyLarge" color={colors.textSecondary}>
          Milestones
        </Text>
        <View style={styles.badges}>
          {MILESTONES.map((m) => {
            const reached = best >= m;
            return (
              <View
                key={m}
                style={[styles.badge, reached && styles.badgeOn]}
                accessibilityLabel={`${m} days, ${reached ? 'reached' : 'locked'}`}
              >
                <RNText style={styles.badgeEmoji}>{reached ? '🏅' : '🔒'}</RNText>
                <Text variant="subheading" color={reached ? colors.text : colors.textMuted}>
                  {m}
                </Text>
                <Text variant="caption" color={colors.textMuted}>
                  days
                </Text>
              </View>
            );
          })}
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingTop: 8 },
  hero: { alignItems: 'center', gap: 4 },
  flame: { fontSize: 54 },
  number: { fontFamily: fonts.displayBold, fontSize: 64, lineHeight: 72, color: colors.text },
  lead: { marginTop: 8 },
  next: { alignSelf: 'stretch', gap: 8, marginTop: 16 },
  nextRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  week: { gap: 14 },
  dots: { flexDirection: 'row', justifyContent: 'space-between' },
  dotCol: { alignItems: 'center', gap: 6 },
  dot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestones: { gap: 14 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badge: {
    width: '30.5%',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.fill,
  },
  badgeOn: { backgroundColor: colors.primarySoft },
  badgeEmoji: { fontSize: 22 },
});
