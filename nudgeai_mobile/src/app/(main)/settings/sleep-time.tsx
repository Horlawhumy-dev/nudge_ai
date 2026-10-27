import { Screen, ScreenHeader } from '@/components/ui';
import { SLEEP_OPTIONS } from '@/features/onboarding/data';
import { TimeOptions } from '@/features/onboarding/components/TimeOptions';
import { usePreferencesStore } from '@/store/usePreferencesStore';
import { colors } from '@/theme';

export default function SleepTime() {
  const sleepTime = usePreferencesStore((s) => s.sleepTime);
  const setPreferences = usePreferencesStore((s) => s.set);

  return (
    <Screen scroll background={colors.background} contentStyle={{ gap: 24, paddingTop: 8 }}>
      <ScreenHeader title="Sleep time" subtitle="Anchors evening habit reminders" />
      <TimeOptions
        options={SLEEP_OPTIONS}
        value={sleepTime}
        onChange={(id) => setPreferences({ sleepTime: id })}
      />
    </Screen>
  );
}
