import { useEffect } from 'react';
import { Animated, Pressable, StyleSheet, useAnimatedValue } from 'react-native';

import { colors } from '@/theme';

type ToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel?: string;
};

const WIDTH = 52;
const KNOB = 24;
const PAD = 4;

export function Toggle({ value, onValueChange, accessibilityLabel }: ToggleProps) {
  const progress = useAnimatedValue(value ? 1 : 0);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [value, progress]);

  const backgroundColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['#E0E0E0', colors.primary],
  });
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [PAD, WIDTH - KNOB - PAD],
  });

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      hitSlop={8}
      onPress={() => onValueChange(!value)}
    >
      <Animated.View style={[styles.track, { backgroundColor }]}>
        <Animated.View style={[styles.knob, { transform: [{ translateX }] }]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: WIDTH, height: 32, borderRadius: 16, justifyContent: 'center' },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: colors.surface },
});
