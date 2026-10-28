import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton, Button, Text } from '@/components/ui';
import { AlarmArt, RhythmArt, StreakArt } from '@/features/onboarding/components/IntroArt';
import { INTRO_SLIDES, type IntroSlide } from '@/features/onboarding/intro';
import { useAnimatedValue } from '@/hooks/useAnimatedValue';
import { useAutoAdvance } from '@/hooks/useAutoAdvance';
import { useAuthStore } from '@/store/useAuthStore';
import { colors, gutter, radius } from '@/theme';

const AUTO_ADVANCE_MS = 4500;

function SlideArt({ slide }: { slide: IntroSlide }) {
  if (slide.id === 'alarm') return <AlarmArt background={colors.intro.alarm} />;
  if (slide.id === 'rhythm') return <RhythmArt />;
  return <StreakArt />;
}

export default function Intro() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<{ scrollTo: (o: { x: number; animated: boolean }) => void }>(null);
  const scrollX = useAnimatedValue(0);
  const [index, setIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const last = INTRO_SLIDES.length - 1;
  const onDark = INTRO_SLIDES[index].id === 'streak';

  // The scroll position is the source of truth for `index` (see syncIndex), so this only scrolls.
  const goTo = useCallback(
    (next: number) => scrollRef.current?.scrollTo({ x: next * width, animated: true }),
    [width]
  );

  useAutoAdvance({
    index,
    count: INTRO_SLIDES.length,
    paused: dragging,
    delayMs: AUTO_ADVANCE_MS,
    onAdvance: goTo,
  });

  const finish = () => {
    useAuthStore.getState().markIntroSeen();
    router.replace('/signup');
  };

  // Keep `index` in step with swipes (and programmatic scrolls) as the page settles.
  const syncIndex = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex((current) => (next >= 0 && next <= last && next !== current ? next : current));
  };

  const background = scrollX.interpolate({
    inputRange: INTRO_SLIDES.map((_, i) => i * width),
    outputRange: INTRO_SLIDES.map((s) => colors.intro[s.id]),
  });

  return (
    <Animated.View
      style={[styles.root, { backgroundColor: background, paddingTop: insets.top + 8 }]}
    >
      <View style={styles.top}>
        <View style={styles.side}>
          {index > 0 ? <BackButton translucent onPress={() => goTo(index - 1)} /> : null}
        </View>
        <View
          style={styles.dots}
          accessibilityLabel={`Slide ${index + 1} of ${INTRO_SLIDES.length}`}
        >
          {INTRO_SLIDES.map((s, i) => (
            <View key={s.id} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <Pressable
          style={[styles.side, styles.skip]}
          onPress={finish}
          hitSlop={12}
          accessibilityRole="button"
        >
          <Text variant="subheading" color={onDark ? colors.white : colors.text}>
            Skip
          </Text>
        </Pressable>
      </View>

      <Animated.ScrollView
        ref={scrollRef as never}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: false,
          listener: syncIndex,
        })}
        onScrollBeginDrag={() => setDragging(true)}
        onScrollEndDrag={() => setDragging(false)}
        style={styles.pager}
      >
        {INTRO_SLIDES.map((slide) => {
          const dark = slide.id === 'streak';
          const textColor = dark ? colors.white : colors.text;
          return (
            <View key={slide.id} style={[styles.page, { width }]}>
              <View style={styles.copy}>
                <Text variant="hero" align="center" color={textColor}>
                  {slide.title.join('\n')}
                </Text>
                <Text
                  variant="bodyLarge"
                  align="center"
                  color={dark ? 'rgba(255,255,255,0.9)' : colors.textSecondary}
                  style={styles.body}
                >
                  {slide.body}
                </Text>
              </View>
              <View style={styles.art}>
                <SlideArt slide={slide} />
              </View>
            </View>
          );
        })}
      </Animated.ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Button
          label={index === last ? 'Get Started' : 'Continue'}
          onPress={index === last ? finish : () => goTo(index + 1)}
          testID="intro-continue"
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
    height: 56,
  },
  side: { width: 64, justifyContent: 'center' },
  skip: { alignItems: 'flex-end' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.12)' },
  dotActive: { width: 36, height: 6, borderRadius: radius.pill, backgroundColor: colors.primary },
  pager: { flex: 1 },
  page: { flex: 1 },
  copy: { paddingHorizontal: gutter + 4, marginTop: 22, gap: 14 },
  body: { paddingHorizontal: 8 },
  art: { flex: 1, paddingHorizontal: gutter, marginTop: 40 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: gutter },
});
