import { useEffect } from 'react';
import { Animated, StyleSheet, View, useAnimatedValue } from 'react-native';

import { colors } from '@/theme';

function Dot({ delay }: { delay: number }) {
  const opacity = useAnimatedValue(0.3);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 350, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [delay, opacity]);

  return <Animated.View style={[styles.dot, { opacity }]} />;
}

export function TypingIndicator() {
  return (
    <View style={styles.row} accessibilityLabel="Nudge is typing">
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, paddingVertical: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
});
