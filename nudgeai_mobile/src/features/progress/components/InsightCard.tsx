import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AiOrb, GradientCard, Icon, Text } from '@/components/ui';
import { colors } from '@/theme';

type InsightCardProps = {
  message: string;
  /** Sent to Nudge AI when the card is tapped. */
  prompt: string;
};

export function InsightCard({ message, prompt }: InsightCardProps) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ask Nudge AI about this insight"
      onPress={() => router.push({ pathname: '/chat', params: { prompt } })}
      style={({ pressed }) => pressed && { opacity: 0.94 }}
    >
      <GradientCard style={styles.card}>
        <AiOrb size={40} framed />
        <View style={styles.texts}>
          <Text variant="heading" style={styles.title}>
            Nudge AI Insight
          </Text>
          <Text variant="bodyLarge" color="rgba(255,255,255,0.88)">
            {message}
          </Text>
          <View style={styles.cta}>
            <Text variant="bodyMedium" color={colors.white}>
              Ask Nudge about this
            </Text>
            <Icon name="arrow-forward" size={16} color={colors.white} />
          </View>
        </View>
      </GradientCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', padding: 18 },
  texts: { flex: 1, gap: 6 },
  title: { fontSize: 18 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
});
