import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { buildSeedNotifications } from '@/features/notifications/data';
import type { NudgeNotification } from '@/features/notifications/types';

import { persistStorage } from './persist';

type NotificationsState = {
  items: NudgeNotification[];
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  restore: (item: NudgeNotification) => void;
  seedDemo: () => void;
  clear: () => void;
};

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set) => ({
      items: [],
      markRead: (id) =>
        set((s) => ({ items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
      markAllRead: () => set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })) })),
      dismiss: (id) => set((s) => ({ items: s.items.filter((n) => n.id !== id) })),
      restore: (item) => set((s) => ({ items: [...s.items, item] })),
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
