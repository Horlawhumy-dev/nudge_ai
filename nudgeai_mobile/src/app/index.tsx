import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useAnimatedValue } from '@/hooks/useAnimatedValue';
import { sleep } from '@/lib/format';
import { whenHydrated } from '@/store/hydration';
import { useAuthStore } from '@/store/useAuthStore';
import { colors, fonts } from '@/theme';

const SPLASH_MS = 2400;
const RESTORE_TIMEOUT_MS = 5000;

/**
 * Splash: the logo springs in over the brand colour while soft rings pulse behind it, then routes by
 * where the session is in the funnel. The native splash uses the same colour, so there is no flash.
 */
export default function Splash() {
  const router = useRouter();
  const logo = useAnimatedValue(0);
  const tagline = useAnimatedValue(0);
  const rings = useAnimatedValue(0);

  useEffect(() => {
    Animated.sequence([
      Animated.spring(logo, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }),
      Animated.timing(tagline, { toValue: 1, duration: 450, useNativeDriver: true }),
    ]).start();
    const pulse = Animated.loop(
      Animated.timing(rings, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    pulse.start();
    return () => pulse.stop();
  }, [logo, tagline, rings]);

  useEffect(() => {
    let cancelled = false;
    // Hold the splash for a beat and until saved state has loaded, so we route on real data.
    // A signed-in user is re-checked with the server, but never kept waiting on a slow network.
    const restore = whenHydrated().then(() =>
      Promise.race([useAuthStore.getState().restoreSession(), sleep(RESTORE_TIMEOUT_MS)])
    );
    void Promise.all([restore, sleep(SPLASH_MS)]).then(() => {
      if (cancelled) return;
      const { status, hasSeenIntro } = useAuthStore.getState();
      if (status === 'ready') router.replace('/home');
      else if (status === 'onboarding') router.replace('/onboarding/step-1');
      else router.replace(hasSeenIntro ? '/login' : '/intro');
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const ring = (delay: number) => {
    const progress = Animated.modulo(Animated.add(rings, delay), 1);
    return {
      opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
      transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.4] }) }],
    };
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Animated.View style={[styles.ring, ring(0)]} />
      <Animated.View style={[styles.ring, ring(0.5)]} />
      <Animated.View
        style={{
          opacity: logo,
          transform: [
            { scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
            { translateY: logo.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
          ],
        }}
      >
        <Image
          source={require('@/assets/images/logo-white.png')}
          style={styles.logo}
          contentFit="contain"
          accessibilityLabel="Nudge"
        />
      </Animated.View>
      <Animated.Text style={[styles.tagline, { opacity: tagline }]}>
        Small nudges. Big streaks.
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
    borderColor: colors.white,
  },
  logo: { width: 172, height: 74 },
  tagline: {
    position: 'absolute',
    bottom: 72,
    fontFamily: fonts.body,
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.4,
  },
});
