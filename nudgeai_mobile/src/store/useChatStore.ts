import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { buildSeedConversations } from '@/features/chat/data';
import { replyTo } from '@/features/chat/replies';
import type { ChatMessage, ChatVia, Conversation } from '@/features/chat/types';
import { createId, sleep } from '@/lib/format';

import { persistStorage } from './persist';
import { displayName, useAuthStore } from './useAuthStore';
import { useHabitsStore } from './useHabitsStore';
import { useTasksStore } from './useTasksStore';

type ChatState = {
  conversations: Conversation[];
  /** The conversation being shown; null means a fresh, empty chat. */
  activeId: string | null;
  /** True while the assistant "thinks"; drives the typing indicator. */
  isReplying: boolean;
  send: (
    text: string,
    options?: { promptEmoji?: string; via?: ChatVia }
  ) => Promise<ChatMessage | null>;
  openConversation: (id: string) => void;
  startNew: () => void;
  deleteConversation: (id: string) => void;
  deleteAll: () => void;
  seedDemo: () => void;
  clear: () => void;
};

const REPLY_DELAY_MS = 900;
const NO_MESSAGES: ChatMessage[] = [];

/** Messages of the active conversation (stable empty array when there is none). */
export const selectMessages = (s: Pick<ChatState, 'conversations' | 'activeId'>): ChatMessage[] =>
  s.conversations.find((c) => c.id === s.activeId)?.messages ?? NO_MESSAGES;

function buildReply(text: string, via: ChatVia): ChatMessage {
  const name = displayName(useAuthStore.getState().user);
  const habits = useHabitsStore.getState().habits.length;
  const tasks = useTasksStore.getState().tasks.length;
  return {
    id: createId('msg'),
    role: 'assistant',
    via,
    text: replyTo(text, name, { habits, tasks }),
  };
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeId: null,
      isReplying: false,

      send: async (text, options = {}) => {
        const trimmed = text.trim();
        if (!trimmed) return null;
        const via = options.via ?? 'text';
        const userMessage: ChatMessage = {
          id: createId('msg'),
          role: 'user',
          text: trimmed,
          via,
          promptEmoji: options.promptEmoji,
        };

        // Append to the active conversation, or start one on the first message.
        let id = get().activeId;
        if (!id || !get().conversations.some((c) => c.id === id)) {
          id = createId('chat');
          const conversation: Conversation = { id, createdAt: Date.now(), messages: [userMessage] };
          set((s) => ({
            conversations: [...s.conversations, conversation],
            activeId: id,
            isReplying: true,
          }));
        } else {
          const target = id;
          set((s) => ({
            conversations: s.conversations.map((c) =>
              c.id === target ? { ...c, messages: [...c.messages, userMessage] } : c
            ),
            isReplying: true,
          }));
        }

        await sleep(via === 'voice' ? REPLY_DELAY_MS * 2 : REPLY_DELAY_MS);
        const reply = buildReply(trimmed, via);
        const target = id;
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === target ? { ...c, messages: [...c.messages, reply] } : c
          ),
          isReplying: false,
        }));
        return reply;
      },

      openConversation: (id) => set({ activeId: id, isReplying: false }),
      startNew: () => set({ activeId: null, isReplying: false }),

      deleteConversation: (id) =>
        set((s) => ({
          conversations: s.conversations.filter((c) => c.id !== id),
          activeId: s.activeId === id ? null : s.activeId,
        })),
      deleteAll: () => set({ conversations: [], activeId: null, isReplying: false }),

      seedDemo: () => set({ conversations: buildSeedConversations(), activeId: null }),
      clear: () => set({ conversations: [], activeId: null, isReplying: false }),
    }),
    {
      name: 'nudge.chat',
      version: 1,
      storage: persistStorage,
      partialize: (s) => ({ conversations: s.conversations, activeId: s.activeId }),
    }
  )
);
