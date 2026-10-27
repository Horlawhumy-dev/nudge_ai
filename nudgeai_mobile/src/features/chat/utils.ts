import { dateKey, formatRelativeDate } from '@/lib/date';

import type { ChatMessage, Conversation, ConversationMode } from './types';

const MAX_TITLE = 70;

/** First thing the user said, trimmed; falls back for empty threads. */
export function conversationTitle(conversation: Pick<Conversation, 'messages'>): string {
  const first = conversation.messages.find((m) => m.role === 'user')?.text.trim();
  if (!first) return 'New chat';
  return first.length > MAX_TITLE ? `${first.slice(0, MAX_TITLE - 1)}…` : first;
}

export function conversationMode(conversation: Pick<Conversation, 'messages'>): ConversationMode {
  const vias = new Set(
    conversation.messages.filter((m) => m.role === 'user').map((m) => m.via ?? 'text')
  );
  if (vias.has('voice') && vias.has('text')) return 'Voice + text';
  return vias.has('voice') ? 'Voice' : 'Text';
}

/** "Today", "Yesterday", otherwise "May 9". */
export function groupLabel(createdAt: number, now: Date = new Date()): string {
  const relative = formatRelativeDate(dateKey(new Date(createdAt)), now);
  if (relative === 'Today' || relative === 'Yesterday') return relative;
  return new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "9:30 am" */
export function formatTime(createdAt: number): string {
  return new Date(createdAt)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase();
}

export type ConversationGroup = { title: string; items: Conversation[] };

/** Newest first, grouped by day label. */
export function groupConversations(
  conversations: readonly Conversation[],
  now: Date = new Date()
): ConversationGroup[] {
  const groups: ConversationGroup[] = [];
  for (const c of [...conversations].sort((a, b) => b.createdAt - a.createdAt)) {
    const title = groupLabel(c.createdAt, now);
    const group = groups.find((g) => g.title === title);
    if (group) group.items.push(c);
    else groups.push({ title, items: [c] });
  }
  return groups;
}

export function lastMessage(messages: readonly ChatMessage[]): ChatMessage | undefined {
  return messages[messages.length - 1];
}
