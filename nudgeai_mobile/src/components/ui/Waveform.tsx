import { StyleSheet, View } from 'react-native';

type WaveformProps = {
  heights: readonly number[];
  color: string;
  /** Bars in this index range use `activeColor` (the "playhead" highlight). */
  activeColor?: string;
  activeRange?: readonly [number, number];
  barWidth?: number;
  gap?: number;
  maxHeight?: number;
};

export function Waveform({
  heights,
  color,
  activeColor,
  activeRange,
  barWidth = 3,
  gap = 3,
  maxHeight = 40,
}: WaveformProps) {
  return (
    <View style={[styles.row, { gap, height: maxHeight }]}>
      {heights.map((h, i) => {
        const active = activeColor && activeRange && i >= activeRange[0] && i <= activeRange[1];
        return (
          <View
            key={i}
            style={{
              width: barWidth,
              height: Math.max(4, h * maxHeight),
              borderRadius: barWidth,
              backgroundColor: active ? activeColor : color,
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
