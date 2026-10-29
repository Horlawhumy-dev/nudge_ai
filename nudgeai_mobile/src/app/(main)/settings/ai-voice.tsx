import { StyleSheet } from 'react-native';

import { ListRow, Screen, ScreenHeader, SectionCard, Toggle } from '@/components/ui';
import { TONES } from '@/features/onboarding/data';
import { ToneCard } from '@/features/settings/components/ToneCard';
import { VoicePreview } from '@/features/settings/components/VoicePreview';
import { displayName, useAuthStore } from '@/store/useAuthStore';
import { usePreferencesStore } from '@/store/usePreferencesStore';
import { colors } from '@/theme';

const PREVIEW: Record<string, (name: string) => string> = {
  gentle: (n) =>
    `“Hey ${n}, your deep work session starts in 10 minutes. You’re on a roll - keep it going!”`,
  firm: (n) => `“${n}. Deep work in 10. Get ready. Let’s go.”`,
  mix: (n) => `“${n}, deep work starts in 10 minutes. Nudge picked today’s mood for you.”`,
};

export default function AiVoiceAndTone() {
  const name = useAuthStore((s) => displayName(s.user)) || 'there';
  const { tone, useName, includeStreak, useEmojis, set } = usePreferencesStore();
  const selected = TONES.find((t) => t.id === tone) ?? TONES[0];

  return (
    <Screen scroll background={colors.background} contentStyle={styles.content}>
      <ScreenHeader title="AI voice & tone" />

      <SectionCard title="Reminder tone" gap={12}>
        {TONES.map((t) => (
          <ToneCard
            key={t.id}
            tone={t}
            name={name}
            selected={t.id === tone}
            onPress={() => set({ tone: t.id })}
          />
        ))}
      </SectionCard>

      <VoicePreview quote={PREVIEW[selected.id](name)} tone={selected.id} />

      <SectionCard title="Preferences">
        <ListRow
          title="Use my name in reminders"
          subtitle={`“Hey ${name}...” instead of “Hey there...”`}
          trailing={
            <Toggle
              value={useName}
              onValueChange={(v) => set({ useName: v })}
              accessibilityLabel="Use my name in reminders"
            />
          }
        />
        <ListRow
          title="Include streak in reminders"
          subtitle="Mention your streak count for motivation"
          trailing={
            <Toggle
              value={includeStreak}
              onValueChange={(v) => set({ includeStreak: v })}
              accessibilityLabel="Include streak in reminders"
            />
          }
        />
        <ListRow
          title="Use emojis in reminders"
          subtitle="Adds a little personality to each nudge."
          trailing={
            <Toggle
              value={useEmojis}
              onValueChange={(v) => set({ useEmojis: v })}
              accessibilityLabel="Use emojis in reminders"
            />
          }
        />
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, paddingTop: 8 },
});
