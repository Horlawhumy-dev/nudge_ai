import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useChatStore } from '@/store/useChatStore';
import { colors, radius, shadows } from '@/theme';

import type { ChatMessage } from '../types';
import { plainText } from '../markdown';
import { ChatMarkdown } from './ChatMarkdown';
import { ProposalCard } from './ProposalCard';

/**
 * One chat message. The Confirm / Not now buttons on a proposal and "Try again" on a failed reply
 * act on the chat store directly, so every screen that shows messages (text chat, Nudge Voice)
 * gets working buttons without having to wire them up.
 */
export function MessageBubble({ message }: { message: ChatMessage }) {
  const resolveProposal = useChatStore((s) => s.resolveProposal);
  const retry = useChatStore((s) => s.retry);
  const onRetry = () => void retry(message.id);
  const onProposal = (proposalId: string, action: 'confirm' | 'reject') =>
    void resolveProposal(message.id, proposalId, action);

  if (message.role === 'assistant') {
    return (
      <View style={styles.assistant} accessibilityLabel={`Nudge: ${plainText(message.text)}`}>
        <ChatMarkdown
          text={message.text}
          color={message.failed ? colors.textSecondary : undefined}
        />
        {message.failed ? (
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
            onConfirm={() => onProposal(p.id, 'confirm')}
            onReject={() => onProposal(p.id, 'reject')}
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
