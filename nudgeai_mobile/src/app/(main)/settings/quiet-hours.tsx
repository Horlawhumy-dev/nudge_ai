import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import {
  Card,
  ListRow,
  Screen,
  ScreenHeader,
  SectionCard,
  SelectField,
  Text,
  Toggle,
} from '@/components/ui';
import { HOUR_OPTIONS, quietHoursLength } from '@/features/settings/utils';
import { usePreferencesStore, type Weekday } from '@/store/usePreferencesStore';
import { colors, radius } from '@/theme';

const WEEKDAYS: readonly Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function QuietHours() {
  const quiet = usePreferencesStore((s) => s.quietHours);
  const setQuietHours = usePreferencesStore((s) => s.setQuietHours);
  const hours = quietHoursLength(quiet.from, quiet.to);

  const toggleDay = (day: Weekday) =>
    setQuietHours({
      days: quiet.days.includes(day) ? quiet.days.filter((d) => d !== day) : [...quiet.days, day],
    });

  return (
    <Screen scroll background={colors.background} contentStyle={styles.content}>
      <ScreenHeader title="Quiet hours" />

      <Card padding={18} radiusSize="lg" style={styles.enable}>
        <View style={styles.enableTexts}>
          <Text variant="subheading">Enable quiet hours</Text>
          <Text variant="body" color={colors.textSecondary}>
            Nudge won’t disturb you during these times
          </Text>
        </View>
        <Toggle
          value={quiet.enabled}
          onValueChange={(v) => setQuietHours({ enabled: v })}
          accessibilityLabel="Enable quiet hours"
        />
      </Card>

      <SectionCard title="Quiet period" gap={14}>
        <View style={styles.period}>
          <View style={styles.periodField}>
            <SelectField
              label="From"
              value={quiet.from}
              options={HOUR_OPTIONS}
              onChange={(v) => setQuietHours({ from: v })}
            />
          </View>
          <View style={styles.periodField}>
            <SelectField
              label="To"
              value={quiet.to}
              options={HOUR_OPTIONS}
              onChange={(v) => setQuietHours({ to: v })}
            />
          </View>
        </View>
        <Text variant="bodyLarge">
          {hours} {hours === 1 ? 'hour' : 'hours'} of quiet. All reminders paused
        </Text>
      </SectionCard>

      <SectionCard title="Repeat on" gap={12}>
        <View style={styles.days}>
          {WEEKDAYS.map((day) => {
            const on = quiet.days.includes(day);
            return (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => toggleDay(day)}
                style={[styles.day, on && styles.dayOn]}
              >
                <Text variant="body" color={on ? colors.white : colors.textSecondary}>
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SectionCard>

      <SectionCard title="Preferences">
        <ListRow
          title="Allow high priority tasks"
          subtitle="Still nudge for urgent tasks during quiet hours"
          trailing={
            <Toggle
              value={quiet.allowHighPriority}
              onValueChange={(v) => setQuietHours({ allowHighPriority: v })}
              accessibilityLabel="Allow high priority tasks"
            />
          }
        />
        <ListRow
          title="Weekend quiet hours"
          subtitle="Apply the same schedule on weekends too."
          trailing={
            <Toggle
              value={quiet.weekends}
              onValueChange={(v) => setQuietHours({ weekends: v })}
              accessibilityLabel="Weekend quiet hours"
            />
          }
        />
      </SectionCard>

      <Card padding={18} radiusSize="lg" style={styles.note}>
        <RNText style={styles.moon}>🌙</RNText>
        <Text variant="bodyLarge" color={colors.primary} style={styles.noteText}>
          Missed reminders during quiet hours will appear as a summary when you wake up.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingTop: 8 },
  enable: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  enableTexts: { flex: 1, gap: 4 },
  period: { flexDirection: 'row', gap: 14 },
  periodField: { flex: 1 },
  days: { flexDirection: 'row', gap: 6 },
  day: {
    flex: 1,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayOn: { backgroundColor: colors.primary },
  note: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  moon: { fontSize: 26 },
  noteText: { flex: 1 },
});
