import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors, radius, shadows } from '@/theme';

import type { ChatMessage } from '../types';
import { ProposalCard } from './ProposalCard';

type Props = {
  message: ChatMessage;
  onProposal?: (proposalId: string, action: 'confirm' | 'reject') => void;
  onRetry?: () => void;
};

export function MessageBubble({ message, onProposal, onRetry }: Props) {
  if (message.role === 'assistant') {
    return (
      <View style={styles.assistant} accessibilityLabel={`Nudge: ${message.text}`}>
        <Text
          variant="bodyLarge"
          color={message.failed ? colors.textSecondary : undefined}
          style={styles.assistantText}
        >
          {message.text}
        </Text>
        {message.failed && onRetry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            onPress={onRetry}
            hitSlop={8}
            style={styles.retry}
          >
            <Text variant="subheading" color={colors.primary}>
              Try again
            </Text>
          </Pressable>
        ) : null}
        {message.proposals?.map((p) => (
          <ProposalCard
            key={p.id}
            proposal={p}
            onConfirm={() => onProposal?.(p.id, 'confirm')}
            onReject={() => onProposal?.(p.id, 'reject')}
          />
        ))}
      </View>
    );
  }

  const fromPrompt = Boolean(message.promptEmoji);
  return (
    <View style={styles.userRow}>
      <View
        style={[styles.user, fromPrompt && styles.prompt]}
        accessibilityLabel={`You: ${message.text}`}
      >
        {fromPrompt ? <RNText style={styles.emoji}>{message.promptEmoji}</RNText> : null}
        <Text variant="bodyLarge">{message.text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  assistant: { maxWidth: '85%' },
  assistantText: { lineHeight: 25 },
  retry: { marginTop: 8, alignSelf: 'flex-start' },
  userRow: { alignItems: 'flex-end' },
  user: {
    maxWidth: '82%',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  prompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    shadowOpacity: 0,
  },
  emoji: { fontSize: 18 },
});
