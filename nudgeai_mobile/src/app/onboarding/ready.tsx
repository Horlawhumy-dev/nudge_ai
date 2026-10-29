import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { SuccessScreen } from '@/features/auth/components/SuccessScreen';
import { firstName } from '@/lib/format';
import { welcomeAloud } from '@/services/welcome';
import { useOnboardingStore } from '@/store/useOnboardingStore';

export default function Ready() {
  const router = useRouter();
  const name = useOnboardingStore((s) => firstName(s.name));

  // The first words Nudge says to someone who has just set it up.
  useEffect(() => {
    welcomeAloud('new');
  }, []);

  return (
    <SuccessScreen
      title={name ? `Nudge is ready for you, ${name}!` : 'Nudge is ready for you!'}
      message="Your AI is all set. Warm reminders, perfect timing — built around you."
      actionLabel="Let’s go"
      onAction={() => router.replace('/home')}
    />
  );
}
