import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEMO_MODE } from '@/constants/env';
import { buildSeedConversations } from '@/features/chat/data';
import { replyTo } from '@/features/chat/replies';
import type { ChatMessage, ChatVia, Conversation, Proposal } from '@/features/chat/types';
import { createId, sleep } from '@/lib/format';
import { ApiError } from '@/services/api/errors';
import { syncPlanner } from '@/services/sync';
import {
  conversationsApi,
  proposalsApi,
  streamChat,
  type ApiProposal,
} from '@/services/api/endpoints/chat';

import { persistStorage } from './persist';
import { displayName, useAuthStore } from './useAuthStore';
import { useHabitsStore } from './useHabitsStore';
import { useTasksStore } from './useTasksStore';
import { toast } from './useToastStore';

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
  /** Resend the message a failed reply was answering. */
  retry: (messageId: string) => Promise<void>;
  /** Confirm or decline a change the assistant proposed. */
  resolveProposal: (
    messageId: string,
    proposalId: string,
    action: 'confirm' | 'reject'
  ) => Promise<void>;
  /** Replace the history with the server's copy of the latest conversations. */
  loadHistory: () => Promise<void>;
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

type Set = (fn: (s: ChatState) => Partial<ChatState>) => void;
type Get = () => ChatState;

const OFFLINE_REPLY = 'I couldn’t reach Nudge AI just now. Check your connection and try again.';
const FAILED_REPLY = 'Something went wrong on my side. Please try again.';

/** Ask the backend and add its answer to the conversation. Never throws. */
async function answerFromServer(
  set: Set,
  get: Get,
  localId: string,
  text: string,
  via: ChatVia
): Promise<ChatMessage | null> {
  const edit = (change: (c: Conversation) => Conversation) =>
    set((s) => ({ conversations: s.conversations.map((c) => (c.id === localId ? change(c) : c)) }));
  const reply: ChatMessage = { id: createId('msg'), role: 'assistant', text: '', via };
  const fail = (message: string): ChatMessage => ({ ...reply, text: message, failed: true });
  let result: ChatMessage | null = null;

  try {
    await streamChat(
      {
        message: text,
        conversation_id: get().conversations.find((c) => c.id === localId)?.serverId,
        via,
      },
      ({ event, data }) => {
        const d = (data ?? {}) as Record<string, unknown>;
        if (event === 'conversation') {
          edit((c) => ({ ...c, serverId: String(d.id), title: String(d.title ?? '') || c.title }));
        } else if (event === 'message') {
          reply.text = String(d.content ?? '');
        } else if (event === 'proposal') {
          const p = d as unknown as ApiProposal;
          reply.proposals = [
            ...(reply.proposals ?? []),
            { id: p.id, summary: p.summary, status: 'pending' },
          ];
        } else if (event === 'meta') {
          if (typeof d.trace_id === 'string') reply.traceId = d.trace_id;
        } else if (event === 'budget') {
          toast.show('You’ve used today’s AI allowance, so replies may be simpler until tomorrow.');
        } else if (event === 'error') {
          reply.text = FAILED_REPLY;
          reply.failed = true;
        }
      }
    );
    result = reply.text ? reply : fail(FAILED_REPLY);
  } catch (e) {
    const offline = e instanceof ApiError && e.isNetwork;
    const limited = e instanceof ApiError && e.isRateLimited;
    result = fail(
      offline
        ? OFFLINE_REPLY
        : limited
          ? 'You’re sending messages quickly. Give me a moment.'
          : FAILED_REPLY
    );
  }

  edit((c) => ({ ...c, messages: [...c.messages, result as ChatMessage] }));
  set(() => ({ isReplying: false }));
  return result;
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

        if (!DEMO_MODE) return await answerFromServer(set, get, id, trimmed, via);

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

      retry: async (messageId) => {
        const { conversations, activeId } = get();
        const convo = conversations.find((c) => c.id === activeId);
        const at = convo?.messages.findIndex((m) => m.id === messageId) ?? -1;
        const asked = at > 0 ? convo?.messages[at - 1] : undefined;
        if (!convo || !asked || asked.role !== 'user') return;
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convo.id ? { ...c, messages: c.messages.filter((m) => m.id !== messageId) } : c
          ),
          isReplying: true,
        }));
        await answerFromServer(set, get, convo.id, asked.text, asked.via ?? 'text');
      },

      resolveProposal: async (messageId, proposalId, action) => {
        const patch = (change: Partial<Proposal>) =>
          set((s) => ({
            conversations: s.conversations.map((c) => ({
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      proposals: m.proposals?.map((p) =>
                        p.id === proposalId ? { ...p, ...change } : p
                      ),
                    }
                  : m
              ),
            })),
          }));
        patch({ status: 'working', error: undefined });
        try {
          if (action === 'confirm') await proposalsApi.confirm(proposalId);
          else await proposalsApi.reject(proposalId);
        } catch (e) {
          // Typically the plan limit or something that changed since: say so on the card.
          const reason = e instanceof ApiError ? e.message : 'Something went wrong. Try again.';
          const retryable = e instanceof ApiError && e.isNetwork;
          patch({ status: retryable ? 'pending' : 'failed', error: reason });
          return;
        }
        patch({ status: action === 'confirm' ? 'confirmed' : 'rejected' });
        if (action === 'confirm') {
          // The assistant changed the user's data: pull it so every screen shows the result.
          await syncPlanner().catch(() => undefined);
        }
      },

      loadHistory: async () => {
        if (DEMO_MODE) return;
        const list = await conversationsApi.list();
        const loaded = await Promise.all(
          list.map(async (item): Promise<Conversation> => {
            const detail = await conversationsApi.get(item.id);
            return {
              id: item.id,
              serverId: item.id,
              title: item.title,
              createdAt: new Date(item.created_at).getTime(),
              messages: detail.messages
                .filter((m) => m.role === 'user' || m.role === 'assistant')
                .map((m) => ({
                  id: m.id,
                  role: m.role as 'user' | 'assistant',
                  text: m.content,
                  via: m.via,
                })),
            };
          })
        );
        set((s) => {
          // The conversation on screen keeps its local copy (proposal cards, retry state).
          const open = s.conversations.find((c) => c.id === s.activeId && c.serverId);
          const fromServer = loaded.map((c) => (open && c.id === open.serverId ? open : c));
          return {
            conversations: [...fromServer, ...s.conversations.filter((c) => !c.serverId)],
            activeId:
              fromServer.some((c) => c.id === s.activeId) || !s.activeId ? s.activeId : null,
          };
        });
      },

      openConversation: (id) => set({ activeId: id, isReplying: false }),
      startNew: () => set({ activeId: null, isReplying: false }),

      deleteConversation: (id) => {
        const serverId = get().conversations.find((c) => c.id === id)?.serverId;
        set((s) => ({
          conversations: s.conversations.filter((c) => c.id !== id),
          activeId: s.activeId === id ? null : s.activeId,
        }));
        if (!DEMO_MODE && serverId) {
          conversationsApi.remove(serverId).catch(() => toast.error('Couldn’t delete that chat.'));
        }
      },
      deleteAll: () => {
        set({ conversations: [], activeId: null, isReplying: false });
        if (!DEMO_MODE) {
          conversationsApi
            .removeAll()
            .catch(() => toast.error('Couldn’t clear your chat history.'));
        }
      },

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
