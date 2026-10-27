import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Text, TextField } from '@/components/ui';
import { StepLayout } from '@/features/onboarding/components/StepLayout';
import { dayPart, firstName } from '@/lib/format';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { colors, radius } from '@/theme';

export default function StepName() {
  const router = useRouter();
  const name = useOnboardingStore((s) => s.name);
  const setName = useOnboardingStore((s) => s.setName);
  const shown = firstName(name);

  return (
    <StepLayout
      step={1}
      title="What should we call you?"
      subtitle="Your AI reminders will address you by your name - make it personal."
      canContinue={shown.length > 0}
      onContinue={() => router.push('/onboarding/step-2')}
    >
      <TextField
        label="Enter your name"
        placeholder="Enter your name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        autoComplete="given-name"
        textContentType="givenName"
        returnKeyType="done"
      />
      {shown ? (
        <View style={styles.preview}>
          <Text variant="subheading">Preview</Text>
          <Text variant="bodyLarge" color={colors.textSecondary} style={styles.previewText}>
            “Good {dayPart()} {shown}! Your deep work starts in 10 mins.”
          </Text>
        </View>
      ) : null}
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  preview: {
    marginTop: 28,
    padding: 18,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    gap: 10,
  },
  previewText: { lineHeight: 24 },
});
