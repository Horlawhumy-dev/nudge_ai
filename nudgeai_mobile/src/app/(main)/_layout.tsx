import { Redirect, Stack } from 'expo-router';

import { useAuthStore } from '@/store/useAuthStore';
import { colors } from '@/theme';

/** Everything behind sign-in. Bounces back to the splash router when the session ends. */
export default function MainLayout() {
  const status = useAuthStore((s) => s.status);
  if (status !== 'ready') return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
