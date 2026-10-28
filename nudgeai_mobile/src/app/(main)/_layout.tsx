import { Redirect, Stack } from 'expo-router';
import { useEffect } from 'react';

import { useReminderSync } from '@/features/reminders/useReminderSync';
import { startPreferenceSync } from '@/services/sync';
import { useAuthStore } from '@/store/useAuthStore';
import { colors } from '@/theme';

/** Everything behind sign-in. Bounces back to the splash router when the session ends. */
export default function MainLayout() {
  const status = useAuthStore((s) => s.status);
  useReminderSync();
  // Settings changes are saved to the server for as long as the user is signed in.
  useEffect(() => (status === 'ready' ? startPreferenceSync() : undefined), [status]);
  if (status !== 'ready') return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    />
  );
}
