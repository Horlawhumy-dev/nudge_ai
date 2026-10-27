import { useRouter } from 'expo-router';
import { StyleSheet, Text as RNText, View } from 'react-native';

import { Chip } from '@/components/ui';
import { GOALS } from '@/features/onboarding/data';
import { StepLayout } from '@/features/onboarding/components/StepLayout';
import { useOnboardingStore } from '@/store/useOnboardingStore';

export default function StepGoals() {
  const router = useRouter();
  const goals = useOnboardingStore((s) => s.goals);
  const toggleGoal = useOnboardingStore((s) => s.toggleGoal);

  return (
    <StepLayout
      step={3}
      title="What are you working on?"
      subtitle="Pick as many as you like. We’ll tailor your habits around these."
      canContinue={goals.length > 0}
      onContinue={() => router.push('/onboarding/step-4')}
    >
      <View style={styles.wrap}>
        {GOALS.map((goal) => (
          <Chip
            key={goal.id}
            label={goal.label}
            tone="grey"
            selected={goals.includes(goal.id)}
            onPress={() => toggleGoal(goal.id)}
            leading={<RNText style={styles.emoji}>{goal.emoji}</RNText>}
            style={styles.chip}
          />
        ))}
      </View>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  chip: { height: 52, paddingHorizontal: 22 },
  emoji: { fontSize: 20 },
});
