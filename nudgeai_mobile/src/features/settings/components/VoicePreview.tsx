import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GradientCard } from '@/components/ui/GradientCard';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Waveform } from '@/components/ui/Waveform';
import type { ToneId } from '@/features/onboarding/data';
import { colors } from '@/theme';

import { deliveryFor, spokenText } from '../voice';

const WAVE = [
  0.3, 0.5, 0.8, 0.4, 0.9, 0.6, 1, 0.5, 0.7, 0.35, 0.85, 0.55, 0.95, 0.45, 0.75, 0.4, 0.8, 0.5,
  0.65, 0.3, 0.7, 0.45,
];

type VoicePreviewProps = {
  quote: string;
  tone: ToneId;
};

/**
 * Plays the sample reminder aloud with the phone's own text-to-speech, in a delivery that
 * matches the chosen tone. (Meta has no speech-output model, so this is the device voice.)
 */
export function VoicePreview({ quote, tone }: VoicePreviewProps) {
  const [speaking, setSpeaking] = useState(false);
  const [head, setHead] = useState(0);

  // Walk the highlight along the waveform while speaking, so it reads as playing.
  useEffect(() => {
    if (!speaking) return;
    const id = setInterval(() => setHead((h) => (h + 1) % WAVE.length), 160);
    return () => clearInterval(id);
  }, [speaking]);

  // Switching tone changes what would be said; silence the old line, and never talk after leaving.
  useEffect(() => {
    return () => {
      void Speech.stop();
    };
  }, [quote, tone]);

  const toggle = () => {
    if (speaking) {
      void Speech.stop();
      setSpeaking(false);
      return;
    }
    const { rate, pitch } = deliveryFor(tone);
    setHead(0);
    setSpeaking(true);
    Speech.speak(spokenText(quote), {
      language: 'en',
      rate,
      pitch,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

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
          accessibilityLabel={speaking ? 'Stop preview' : 'Play preview'}
          onPress={toggle}
          style={styles.play}
        >
          <Icon name={speaking ? 'stop' : 'play'} size={20} color={colors.white} />
        </Pressable>
        <Waveform
          heights={WAVE}
          color="rgba(255,255,255,0.75)"
          activeColor={colors.pink}
          activeRange={speaking ? [Math.max(0, head - 1), head + 1] : [11, 13]}
          maxHeight={36}
        />
        <Text variant="body" color="rgba(255,255,255,0.8)">
          {speaking ? 'Playing' : 'Tap to hear'}
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
