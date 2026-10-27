import { useRouter } from 'expo-router';

import { WAKE_OPTIONS } from '@/features/onboarding/data';
import { StepLayout } from '@/features/onboarding/components/StepLayout';
import { TimeOptions } from '@/features/onboarding/components/TimeOptions';
import { useOnboardingStore } from '@/store/useOnboardingStore';

export default function StepWake() {
  const router = useRouter();
  const wakeTime = useOnboardingStore((s) => s.wakeTime);
  const setWakeTime = useOnboardingStore((s) => s.setWakeTime);

  return (
    <StepLayout
      step={2}
      title={'When do you usually\nwake up?'}
      subtitle="We’ll schedule your first nudge around your morning rhythm."
      canContinue={wakeTime !== null}
      onContinue={() => router.push('/onboarding/step-3')}
    >
      <TimeOptions options={WAKE_OPTIONS} value={wakeTime} onChange={setWakeTime} />
    </StepLayout>
  );
}
