import { useRouter } from 'expo-router';

import { SuccessScreen } from '@/features/auth/components/SuccessScreen';

export default function PasswordReset() {
  const router = useRouter();
  return (
    <SuccessScreen
      title="You’re all set!"
      message="Your password has been reset successfully. You can now log back in."
      actionLabel="Back to login"
      onAction={() => router.dismissTo('/login')}
    />
  );
}
