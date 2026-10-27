import { StyleSheet, Text as RNText, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors, radius, shadows } from '@/theme';

import type { ChatMessage } from '../types';

export function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'assistant') {
    return (
      <View style={styles.assistant} accessibilityLabel={`Nudge: ${message.text}`}>
        <Text variant="bodyLarge" style={styles.assistantText}>
          {message.text}
        </Text>
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
