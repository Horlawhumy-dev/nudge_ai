import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastHost } from '@/components/ui';
import { API_URL, DEMO_MODE } from '@/constants/env';
import { useAppFonts } from '@/hooks/useAppFonts';
import { configureNotifications } from '@/services/notifications';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync();
// Shown in the Metro terminal, so it's obvious whether the app is talking to a server.
if (__DEV__) {
  console.log(
    DEMO_MODE
      ? '[nudge] DEMO MODE: no EXPO_PUBLIC_API_URL, nothing is sent to a server'
      : `[nudge] using API ${API_URL}`
  );
}
configureNotifications();

export default function RootLayout() {
  const { ready } = useAppFonts();

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <ToastHost />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.backgroundAuth },
          }}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
