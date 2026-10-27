import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton, Button, Text } from '@/components/ui';
import { AlarmArt, RhythmArt, StreakArt } from '@/features/onboarding/components/IntroArt';
import { INTRO_SLIDES } from '@/features/onboarding/intro';
import { useAuthStore } from '@/store/useAuthStore';
import { colors, gutter, radius } from '@/theme';

const ART = { alarm: AlarmArt, rhythm: RhythmArt, streak: StreakArt } as const;

export default function Intro() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const slide = INTRO_SLIDES[index];
  const Art = ART[slide.id];
  const isLast = index === INTRO_SLIDES.length - 1;
  const background = colors.intro[slide.id];
  const onDark = slide.id === 'streak';
  const textColor = onDark ? colors.white : colors.text;

  const finish = () => {
    useAuthStore.getState().markIntroSeen();
    router.replace('/signup');
  };

  return (
    <View style={[styles.root, { backgroundColor: background, paddingTop: insets.top + 8 }]}>
      <View style={styles.top}>
        <View style={styles.side}>
          {index > 0 ? <BackButton translucent onPress={() => setIndex((i) => i - 1)} /> : null}
        </View>
        <View style={styles.dots} accessibilityLabel={`Slide ${index + 1} of ${INTRO_SLIDES.length}`}>
          {INTRO_SLIDES.map((s, i) => (
            <View key={s.id} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <Pressable style={[styles.side, styles.skip]} onPress={finish} hitSlop={12} accessibilityRole="button">
          <Text variant="subheading" color={textColor}>
            Skip
          </Text>
        </Pressable>
      </View>

      <View style={styles.copy}>
        <Text variant="hero" align="center" color={textColor}>
          {slide.title.join('\n')}
        </Text>
        <Text variant="bodyLarge" align="center" color={onDark ? 'rgba(255,255,255,0.9)' : colors.textSecondary} style={styles.body}>
          {slide.body}
        </Text>
      </View>

      <View style={styles.art}>
        <Art />
      </View>

      <LinearGradient
        pointerEvents="none"
        colors={[`${background}00`, background]}
        style={[styles.fade, { height: insets.bottom + 120 }]}
      />
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Button
          label={isLast ? 'Get Started' : 'Continue'}
          onPress={isLast ? finish : () => setIndex((i) => i + 1)}
          testID="intro-continue"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: gutter, height: 56 },
  side: { width: 64, justifyContent: 'center' },
  skip: { alignItems: 'flex-end' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.12)' },
  dotActive: { width: 36, height: 6, borderRadius: radius.pill, backgroundColor: colors.primary },
  copy: { paddingHorizontal: gutter + 4, marginTop: 22, gap: 14 },
  body: { paddingHorizontal: 8 },
  art: { flex: 1, paddingHorizontal: gutter, marginTop: 20 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: gutter },
});
