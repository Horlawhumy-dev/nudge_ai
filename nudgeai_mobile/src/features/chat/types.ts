export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  /** Set on the first message when it came from a quick prompt chip. */
  promptEmoji?: string;
};

export type QuickPrompt = { id: string; emoji: string; label: string };

export type ConversationSummary = {
  id: string;
  title: string;
  time: string;
  messageCount: number;
  mode: 'Text' | 'Voice' | 'Voice + text';
  group: string;
};
