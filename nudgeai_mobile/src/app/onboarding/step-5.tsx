import { useRouter } from 'expo-router';

import { StepLayout } from '@/features/onboarding/components/StepLayout';
import { ToneOptions } from '@/features/onboarding/components/ToneOptions';
import { firstName } from '@/lib/format';
import { useAuthStore } from '@/store/useAuthStore';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { usePreferencesStore } from '@/store/usePreferencesStore';

export default function StepTone() {
  const router = useRouter();
  const { name, tone, wakeTime, sleepTime, goals, setTone } = useOnboardingStore();

  const finish = () => {
    usePreferencesStore.getState().set({
      tone: tone ?? 'mix',
      wakeTime: wakeTime ?? '7-8',
      sleepTime: sleepTime ?? '1030-12',
      goals,
    });
    // The full name stays as signed up; the onboarding name is what reminders call the user.
    useAuthStore.getState().completeOnboarding(firstName(name));
    router.replace('/onboarding/notifications');
  };

  return (
    <StepLayout
      step={5}
      title={'How would you like to be\nNudged?'}
      subtitle="Your AI will match this energy every single time."
      actionLabel="Finish Setup"
      canContinue={tone !== null}
      onContinue={finish}
    >
      <ToneOptions value={tone} name={firstName(name)} onChange={setTone} />
    </StepLayout>
  );
}
