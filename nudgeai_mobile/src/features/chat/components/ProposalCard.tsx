import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { colors, radius } from '@/theme';

import type { Proposal } from '../types';

type Props = {
  proposal: Proposal;
  onConfirm: () => void;
  onReject: () => void;
};

/** One change the assistant wants to make. Nothing happens until the user says yes. */
export function ProposalCard({ proposal, onConfirm, onReject }: Props) {
  const { status, summary, error } = proposal;
  const decided = status === 'confirmed' || status === 'rejected';

  return (
    <View
      style={[styles.card, decided && styles.decided]}
      accessibilityLabel={`Suggested change: ${summary}`}
    >
      <Text variant="bodyLarge" style={styles.summary}>
        {summary}
      </Text>

      {status === 'confirmed' ? (
        <View style={styles.result}>
          <Icon name="checkmark-circle" size={18} color={colors.success} />
          <Text variant="caption" color={colors.success}>
            Done
          </Text>
        </View>
      ) : status === 'rejected' ? (
        <Text variant="caption" color={colors.textMuted}>
          Skipped
        </Text>
      ) : status === 'working' ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          {status === 'failed' && error ? (
            <View style={styles.result} accessibilityRole="alert">
              <Icon name="alert-circle" size={16} color={colors.danger} />
              <Text variant="caption" color={colors.danger} style={styles.error}>
                {error}
              </Text>
            </View>
          ) : null}
          {status === 'failed' ? null : (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Confirm change"
                onPress={() => {
                  haptics.success();
                  onConfirm();
                }}
                style={[styles.button, styles.confirm]}
              >
                <Text variant="subheading" color={colors.white}>
                  Confirm
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Skip change"
                onPress={onReject}
                style={[styles.button, styles.skip]}
              >
                <Text variant="subheading" color={colors.textSecondary}>
                  Not now
                </Text>
              </Pressable>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    padding: 14,
    gap: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryTint,
  },
  decided: { opacity: 0.7 },
  summary: { lineHeight: 24 },
  actions: { flexDirection: 'row', gap: 10 },
  button: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirm: { backgroundColor: colors.primary },
  skip: { backgroundColor: colors.surface },
  result: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  error: { flex: 1 },
});
