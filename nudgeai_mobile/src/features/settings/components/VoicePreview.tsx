import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GradientCard, Icon, Text, Waveform } from '@/components/ui';
import { colors } from '@/theme';

const DURATION_SECONDS = 5;
const WAVE = [
  0.3, 0.5, 0.8, 0.4, 0.9, 0.6, 1, 0.5, 0.7, 0.35, 0.85, 0.55, 0.95, 0.45, 0.75, 0.4, 0.8, 0.5,
  0.65, 0.3, 0.7, 0.45,
];

type VoicePreviewProps = {
  quote: string;
};

/** Mock player: animates the playhead; real audio arrives with the voice backend. */
export function VoicePreview({ quote }: VoicePreviewProps) {
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setElapsed((e) => {
        if (e + 0.25 >= DURATION_SECONDS) {
          setPlaying(false);
          return 0;
        }
        return e + 0.25;
      });
    }, 250);
    return () => clearInterval(id);
  }, [playing]);

  const head = Math.floor((elapsed / DURATION_SECONDS) * WAVE.length);
  const shown = playing ? elapsed : DURATION_SECONDS;

  return (
    <GradientCard variant="card" style={styles.card}>
      <Text variant="heading" style={styles.title}>
        Preview your Nudge
      </Text>
      <Text variant="bodyLarge" color="rgba(255,255,255,0.92)">
        {quote}
      </Text>
      <View style={styles.player}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause preview' : 'Play preview'}
          onPress={() => setPlaying((p) => !p)}
          style={styles.play}
        >
          <Icon name={playing ? 'pause' : 'play'} size={20} color={colors.white} />
        </Pressable>
        <Waveform
          heights={WAVE}
          color="rgba(255,255,255,0.75)"
          activeColor={colors.pink}
          activeRange={playing ? [Math.max(0, head - 1), head + 1] : [11, 13]}
          maxHeight={36}
        />
        <Text variant="bodyLarge" color="rgba(255,255,255,0.8)">
          0:{String(Math.ceil(shown)).padStart(2, '0')}
        </Text>
      </View>
    </GradientCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, padding: 20 },
  title: { color: colors.white },
  player: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  play: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
