import { useRouter } from 'expo-router';

import { SuccessScreen } from '@/features/auth/components/SuccessScreen';
import { firstName } from '@/lib/format';
import { useOnboardingStore } from '@/store/useOnboardingStore';

export default function Ready() {
  const router = useRouter();
  const name = useOnboardingStore((s) => firstName(s.name));

  return (
    <SuccessScreen
      title={name ? `Nudge is ready for you, ${name}!` : 'Nudge is ready for you!'}
      message="Your AI is all set. Warm reminders, perfect timing — built around you."
      actionLabel="Let’s go"
      onAction={() => router.replace('/home')}
    />
  );
}
