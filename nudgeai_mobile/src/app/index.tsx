import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { sleep } from '@/lib/format';
import { whenHydrated } from '@/store/hydration';
import { useAuthStore } from '@/store/useAuthStore';
import { colors } from '@/theme';

const SPLASH_MS = 1400;

/** Splash: shows the wordmark, then routes by where the session is in the funnel. */
export default function Splash() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    // Hold the splash for a beat and until saved state has loaded, so we route on real data.
    void Promise.all([whenHydrated(), sleep(SPLASH_MS)]).then(() => {
      if (cancelled) return;
      const { status, hasSeenIntro } = useAuthStore.getState();
      if (status === 'ready') router.replace('/home');
      else if (status === 'onboarding') router.replace('/onboarding/step-1');
      else if (status === 'unverified') router.replace('/verify');
      else router.replace(hasSeenIntro ? '/login' : '/intro');
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <View style={styles.root}>
      <Image
        source={require('@/assets/images/logo.png')}
        style={styles.logo}
        contentFit="contain"
        accessibilityLabel="Nudge"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.backgroundAuth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: 172, height: 74 },
});
