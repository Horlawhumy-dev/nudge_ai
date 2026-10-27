import { create } from 'zustand';

import { replyTo } from '@/features/chat/replies';
import type { ChatMessage } from '@/features/chat/types';
import { createId, sleep } from '@/lib/format';

import { useAuthStore } from './useAuthStore';
import { useHabitsStore } from './useHabitsStore';
import { useTasksStore } from './useTasksStore';

type ChatState = {
  messages: ChatMessage[];
  /** True while the assistant "thinks"; drives the typing indicator. */
  isReplying: boolean;
  send: (text: string, promptEmoji?: string) => Promise<void>;
  /** Voice turns reuse the same reply logic but report the reply back to the caller. */
  sendVoice: (text: string) => Promise<ChatMessage>;
  clear: () => void;
};

const REPLY_DELAY_MS = 900;

function buildReply(text: string): ChatMessage {
  const name = useAuthStore.getState().user?.name ?? '';
  const habits = useHabitsStore.getState().habits.length;
  const tasks = useTasksStore.getState().tasks.length;
  return { id: createId('msg'), role: 'assistant', text: replyTo(text, name, { habits, tasks }) };
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isReplying: false,

  send: async (text, promptEmoji) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    set((s) => ({
      messages: [...s.messages, { id: createId('msg'), role: 'user', text: trimmed, promptEmoji }],
      isReplying: true,
    }));
    await sleep(REPLY_DELAY_MS);
    set((s) => ({ messages: [...s.messages, buildReply(trimmed)], isReplying: false }));
  },

  sendVoice: async (text) => {
    set((s) => ({
      messages: [...s.messages, { id: createId('msg'), role: 'user', text, }],
      isReplying: true,
    }));
    await sleep(REPLY_DELAY_MS * 2);
    const reply = buildReply(text);
    set((s) => ({ messages: [...s.messages, reply], isReplying: false }));
    return reply;
  },

  clear: () => set({ messages: [], isReplying: false }),
}));
