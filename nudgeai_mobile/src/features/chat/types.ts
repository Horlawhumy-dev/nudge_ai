export type ChatRole = 'user' | 'assistant';
export type ChatVia = 'text' | 'voice';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  via?: ChatVia;
  /** Set on the first message when it came from a quick prompt chip. */
  promptEmoji?: string;
};

export type ConversationMode = 'Text' | 'Voice' | 'Voice + text';

export type Conversation = {
  id: string;
  /** Epoch ms of the first message; drives grouping and the time shown in history. */
  createdAt: number;
  messages: ChatMessage[];
};

export type QuickPrompt = { id: string; emoji: string; label: string };
