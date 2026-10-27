import { StyleSheet, View } from 'react-native';

import { AiOrb, GradientCard, Text } from '@/components/ui';

export function InsightCard({ message }: { message: string }) {
  return (
    <GradientCard style={styles.card}>
      <AiOrb size={40} framed />
      <View style={styles.texts}>
        <Text variant="heading" style={styles.title}>
          Nudge AI Insight
        </Text>
        <Text variant="bodyLarge" color="rgba(255,255,255,0.88)">
          {message}
        </Text>
      </View>
    </GradientCard>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', padding: 18 },
  texts: { flex: 1, gap: 6 },
  title: { fontSize: 18 },
});
