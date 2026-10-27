import { useState } from 'react';
import { Animated } from 'react-native';

/**
 * A stable `Animated.Value`. React Native exports its own `useAnimatedValue`, but
 * react-native-web does not, so the app keeps one that works on every platform.
 */
export function useAnimatedValue(initialValue: number): Animated.Value {
  const [value] = useState(() => new Animated.Value(initialValue));
  return value;
}
