import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { ProgressRing, Text } from '@/components/ui';
import { colors, radius } from '@/theme';

type ProgressCardProps = {
  done: number;
  total: number;
  label: string;
  /** Ring colour; the card background is a faded tint of it. */
  color: string;
};

/** Compact "x/y done" card: small ring beside the label, on a background that fades to white. */
export function ProgressCard({ done, total, label, color }: ProgressCardProps) {
  return (
    <LinearGradient
      colors={[`${color}33`, `${color}0D`, colors.surface]}
      locations={[0, 0.55, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
      accessible
      accessibilityLabel={`${label}: ${done} of ${total}`}
    >
      <ProgressRing
        progress={total > 0 ? done / total : 0}
        size={48}
        strokeWidth={5}
        color={color}
        label={`${done}/${total}`}
        labelSize="sm"
        trackColor="rgba(255,255,255,0.9)"
      />
      <View style={styles.texts}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {label}
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
  },
  texts: { flex: 1 },
});
