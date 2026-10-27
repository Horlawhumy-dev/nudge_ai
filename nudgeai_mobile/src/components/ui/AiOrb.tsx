import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

type AiOrbProps = {
  size?: number;
  /** Put the mark on a white disc, as on the home banner and list icons. */
  framed?: boolean;
};

export function AiOrb({ size = 48, framed = false }: AiOrbProps) {
  if (framed) {
    const inner = size * 0.72;
    return (
      <View style={[styles.frame, { width: size, height: size, borderRadius: size / 2 }]}>
        <Image source={require('@/assets/images/ai-orb.png')} style={{ width: inner, height: inner }} contentFit="contain" />
      </View>
    );
  }
  return (
    <Image
      source={require('@/assets/images/ai-orb.png')}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityLabel="Nudge AI"
    />
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
});
