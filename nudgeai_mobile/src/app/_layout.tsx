import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastHost } from '@/components/ui';
import { useAppFonts } from '@/hooks/useAppFonts';
import { configureNotifications } from '@/services/notifications';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync();
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
