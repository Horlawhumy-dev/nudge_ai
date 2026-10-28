import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEMO_MODE } from '@/constants/env';
import { buildSeedNotifications } from '@/features/notifications/data';
import type { NudgeNotification } from '@/features/notifications/types';

import { notificationsApi } from '@/services/api/endpoints/notifications';

import { persistStorage } from './persist';
import { reportFailure } from './remote';

type NotificationsState = {
  items: NudgeNotification[];
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  restore: (item: NudgeNotification) => void;
  /** Fetch the server's inbox (pull-to-refresh, opening the screen, after sign-in). */
  refresh: () => Promise<void>;
  seedDemo: () => void;
  clear: () => void;
};

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set, get) => ({
      items: [],
      markRead: (id) => {
        set((s) => ({ items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)) }));
        // Quiet on failure: it will simply show as unread again after the next refresh.
        if (!DEMO_MODE) notificationsApi.markRead(id).catch(() => undefined);
      },
      markAllRead: () => {
        set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })) }));
        if (!DEMO_MODE) notificationsApi.markAllRead().catch(() => undefined);
      },
      dismiss: (id) => {
        const item = get().items.find((n) => n.id === id);
        set((s) => ({ items: s.items.filter((n) => n.id !== id) }));
        if (!DEMO_MODE && item) {
          notificationsApi.remove(id).catch((e: unknown) => {
            set((s) => ({ items: [...s.items, item] }));
            reportFailure(e, 'Couldn’t delete that notification.');
          });
        }
      },
      restore: (item) => {
        set((s) => ({ items: [...s.items, item] }));
        if (!DEMO_MODE) notificationsApi.restore(item.id).catch(() => undefined);
      },
      refresh: async () => {
        if (DEMO_MODE) return;
        set({ items: await notificationsApi.list() });
      },
      seedDemo: () => set({ items: buildSeedNotifications() }),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'nudge.notifications',
      storage: persistStorage,
      partialize: (s) => ({ items: s.items }),
    }
  )
);
