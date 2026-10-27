import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, fonts } from '@/theme';

import { Text } from './Text';

type ProgressRingProps = {
  /** 0–1 */
  progress: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  label?: string;
  labelSize?: 'sm' | 'md';
};

export function ProgressRing({
  progress,
  size = 72,
  strokeWidth = 7,
  color,
  label,
  labelSize = 'md',
}: ProgressRingProps) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={styles.rotate}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.borderSoft}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - clamped)}
        />
      </Svg>
      {label ? (
        <View style={styles.center}>
          <Text
            variant={labelSize === 'sm' ? 'caption' : 'numeral'}
            style={labelSize === 'sm' ? styles.small : undefined}
          >
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rotate: { transform: [{ rotate: '-90deg' }] },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: { fontFamily: fonts.bodyMedium, fontSize: 12 },
});
