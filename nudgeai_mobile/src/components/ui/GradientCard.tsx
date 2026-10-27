import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { gradients, radius } from '@/theme';

type GradientCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Purple "Nudge AI" surface used by the home banner, insights and the Pro upsell. */
export function GradientCard({ children, style }: GradientCardProps) {
  return (
    <LinearGradient
      colors={gradients.ai}
      start={gradients.aiStart}
      end={gradients.aiEnd}
      style={[styles.card, style]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.xl, padding: 20, overflow: 'hidden' },
});
