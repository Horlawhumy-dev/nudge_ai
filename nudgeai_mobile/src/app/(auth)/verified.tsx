import { useRouter } from 'expo-router';

import { SuccessScreen } from '@/features/auth/components/SuccessScreen';

export default function Verified() {
  const router = useRouter();
  return (
    <SuccessScreen
      title="You’re verified!"
      message="Your email address has been confirmed. You can now continue setting up your account."
      actionLabel="Continue setup"
      onAction={() => router.replace('/onboarding/step-1')}
    />
  );
}
