import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { gradients, radius } from '@/theme';

type GradientCardProps = {
  children: ReactNode;
  /** `banner` fades in from a light lavender edge (icon first); `card` is a deeper purple throughout. */
  variant?: 'banner' | 'card';
  style?: StyleProp<ViewStyle>;
};

/** Purple "Nudge AI" surface used by the home banner, insights, voice preview and the Pro upsell. */
export function GradientCard({ children, variant = 'banner', style }: GradientCardProps) {
  return variant === 'banner' ? (
    <LinearGradient
      colors={gradients.banner}
      locations={gradients.bannerLocations}
      start={gradients.start}
      end={gradients.end}
      style={[styles.card, style]}
    >
      {children}
    </LinearGradient>
  ) : (
    <LinearGradient
      colors={gradients.card}
      start={gradients.start}
      end={gradients.end}
      style={[styles.card, style]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.xl, padding: 20, overflow: 'hidden' },
});
