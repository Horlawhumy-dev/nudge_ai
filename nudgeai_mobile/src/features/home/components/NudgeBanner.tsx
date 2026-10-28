import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AiOrb, GradientCard, Icon, Text } from '@/components/ui';
import { colors, fonts } from '@/theme';

type NudgeBannerProps = {
  message: string;
};

/** The AI's current nudge, shown at the top of Home. */
export function NudgeBanner({ message }: NudgeBannerProps) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open Nudge AI"
      onPress={() => router.push('/chat')}
      style={({ pressed }) => pressed && { opacity: 0.94 }}
    >
      <GradientCard style={styles.card}>
        <AiOrb size={46} framed />
        <View style={styles.texts}>
          <Text variant="heading" style={styles.title}>
            Nudge AI
          </Text>
          <Text variant="bodyLarge" color="rgba(255,255,255,0.85)">
            {message}
          </Text>
        </View>
        <View style={styles.sparkles} pointerEvents="none">
          <Icon name="sparkles" size={34} color="rgba(255,255,255,0.55)" />
          <Icon name="sparkles" size={16} color="rgba(255,255,255,0.4)" />
        </View>
      </GradientCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  texts: { flex: 1, gap: 6, paddingRight: 28 },
  title: { fontFamily: fonts.bodyMedium, fontSize: 20, color: colors.text },
  sparkles: { position: 'absolute', right: 18, top: 18, alignItems: 'center', gap: 14 },
});
