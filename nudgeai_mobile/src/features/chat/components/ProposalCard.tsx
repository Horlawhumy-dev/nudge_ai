import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { haptics } from '@/lib/haptics';
import { colors, radius } from '@/theme';

import type { Proposal } from '../types';
import { ProposalEditSheet, type TaskEdit } from './ProposalEditSheet';

type Props = {
  proposal: Proposal;
  onConfirm: () => void;
  onReject: () => void;
  /** Save a hand edit of a suggested task. Resolves to an error message, or null. */
  onEdit?: (edit: TaskEdit) => Promise<string | null>;
};

/** One change the assistant wants to make. Nothing happens until the user says yes. */
export function ProposalCard({ proposal, onConfirm, onReject, onEdit }: Props) {
  const [editing, setEditing] = useState(false);
  const { status, summary, error } = proposal;
  const decided = status === 'confirmed' || status === 'rejected';
  const isTask = proposal.tool === 'task_create' && onEdit !== undefined;
  // A task the assistant gave no day for can't be added until the person picks one.
  const needsDay = isTask && !proposal.whenConfirmed && typeof proposal.args?.date !== 'string';

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
                  if (needsDay) return setEditing(true);
                  haptics.success();
                  onConfirm();
                }}
                style={[styles.button, styles.confirm]}
              >
                <Text variant="subheading" color={colors.white}>
                  Confirm
                </Text>
              </Pressable>
              {isTask ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit suggestion"
                  onPress={() => setEditing(true)}
                  style={[styles.button, styles.skip]}
                >
                  <Text variant="subheading" color={colors.primary}>
                    Edit
                  </Text>
                </Pressable>
              ) : null}
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
      {isTask && editing ? (
        <ProposalEditSheet
          key={proposal.summary}
          proposal={proposal}
          visible
          onClose={() => setEditing(false)}
          onSave={onEdit}
        />
      ) : null}
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
