import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

type ProgressBarProps = {
  /** 0–1 */
  progress: number;
  color: string;
  height?: number;
};

export function ProgressBar({ progress, color, height = 8 }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <View style={[styles.track, { height }]}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill },
});
