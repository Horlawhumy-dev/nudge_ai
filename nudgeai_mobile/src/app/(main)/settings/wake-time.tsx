import { Screen, ScreenHeader } from '@/components/ui';
import { WAKE_OPTIONS } from '@/features/onboarding/data';
import { TimeOptions } from '@/features/onboarding/components/TimeOptions';
import { usePreferencesStore } from '@/store/usePreferencesStore';
import { colors } from '@/theme';

export default function WakeTime() {
  const wakeTime = usePreferencesStore((s) => s.wakeTime);
  const setPreferences = usePreferencesStore((s) => s.set);

  return (
    <Screen scroll background={colors.background} contentStyle={{ gap: 24, paddingTop: 8 }}>
      <ScreenHeader title="Wake up time" subtitle="Anchors morning habit reminders" />
      <TimeOptions
        options={WAKE_OPTIONS}
        value={wakeTime}
        onChange={(id) => setPreferences({ wakeTime: id })}
      />
    </Screen>
  );
}
