import { Redirect, Stack } from 'expo-router';
import { useEffect } from 'react';

import { DEMO_MODE } from '@/constants/env';
import { useReminderSync } from '@/features/reminders/useReminderSync';
import { registerDevice } from '@/services/push';
import { startPreferenceSync } from '@/services/sync';
import { useAuthStore } from '@/store/useAuthStore';
import { colors } from '@/theme';

/** Everything behind sign-in. Bounces back to the splash router when the session ends. */
export default function MainLayout() {
  const status = useAuthStore((s) => s.status);
  useReminderSync();
  // Settings changes are saved to the server for as long as the user is signed in.
  useEffect(() => (status === 'ready' ? startPreferenceSync() : undefined), [status]);
  // Register this phone for the nudges the server sends (no-op in demo mode or without permission).
  useEffect(() => {
    if (status === 'ready' && !DEMO_MODE) void registerDevice().catch(() => undefined);
  }, [status]);
  if (status !== 'ready') return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    />
  );
}
