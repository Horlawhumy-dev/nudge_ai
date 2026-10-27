import { useEffect } from 'react';
import { Animated, useAnimatedValue } from 'react-native';

import { AiOrb } from '@/components/ui';

type PulsingOrbProps = {
  size: number;
  active: boolean;
};

/** The Nudge mark, breathing while the mic is live. */
export function PulsingOrb({ size, active }: PulsingOrbProps) {
  const scale = useAnimatedValue(1);

  useEffect(() => {
    if (!active) {
      scale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.06, duration: 900, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.97, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <AiOrb size={size} />
    </Animated.View>
  );
}
