import { useRouter } from 'expo-router';

import { SLEEP_OPTIONS } from '@/features/onboarding/data';
import { StepLayout } from '@/features/onboarding/components/StepLayout';
import { TimeOptions } from '@/features/onboarding/components/TimeOptions';
import { useOnboardingStore } from '@/store/useOnboardingStore';

export default function StepSleep() {
  const router = useRouter();
  const sleepTime = useOnboardingStore((s) => s.sleepTime);
  const setSleepTime = useOnboardingStore((s) => s.setSleepTime);

  return (
    <StepLayout
      step={4}
      title="When do you usually sleep?"
      subtitle="We’ll make sure your last nudge doesn’t interrupt your rest."
      canContinue={sleepTime !== null}
      onContinue={() => router.push('/onboarding/step-5')}
    >
      <TimeOptions options={SLEEP_OPTIONS} value={sleepTime} onChange={setSleepTime} />
    </StepLayout>
  );
}
