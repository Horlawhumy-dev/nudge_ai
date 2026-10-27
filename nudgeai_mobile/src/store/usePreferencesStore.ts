import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ToneId } from '@/features/onboarding/data';

import { persistStorage, STORE_VERSION } from './persist';

export type NotificationKey = 'push' | 'voice' | 'morningSummary' | 'weeklyReport' | 'streakAlerts';
export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
export type Plan = 'free' | 'pro';

export type QuietHours = {
  enabled: boolean;
  from: string;
  to: string;
  days: Weekday[];
  allowHighPriority: boolean;
  weekends: boolean;
};

type PreferencesState = {
  tone: ToneId;
  useName: boolean;
  includeStreak: boolean;
  useEmojis: boolean;
  wakeTime: string;
  sleepTime: string;
  goals: string[];
  habitStacking: boolean;
  notifications: Record<NotificationKey, boolean>;
  quietHours: QuietHours;
  plan: Plan;

  set: (
    patch: Partial<Omit<PreferencesState, 'set' | 'setNotification' | 'setQuietHours' | 'reset'>>
  ) => void;
  setNotification: (key: NotificationKey, value: boolean) => void;
  setQuietHours: (patch: Partial<QuietHours>) => void;
  reset: () => void;
};

const initial = {
  tone: 'gentle' as ToneId,
  useName: true,
  includeStreak: true,
  useEmojis: false,
  wakeTime: '7-8',
  sleepTime: '1030-12',
  goals: [] as string[],
  habitStacking: true,
  notifications: {
    push: true,
    voice: true,
    morningSummary: true,
    weeklyReport: false,
    streakAlerts: true,
  },
  quietHours: {
    enabled: true,
    from: '10:00 PM',
    to: '7:00 AM',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as Weekday[],
    allowHighPriority: true,
    weekends: false,
  },
  plan: 'free' as Plan,
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      ...initial,
      set: (patch) => set(patch),
      setNotification: (key, value) =>
        set((s) => ({ notifications: { ...s.notifications, [key]: value } })),
      setQuietHours: (patch) => set((s) => ({ quietHours: { ...s.quietHours, ...patch } })),
      reset: () => set(initial),
    }),
    {
      name: 'nudge.preferences',
      version: STORE_VERSION,
      storage: persistStorage,
      partialize: (s) => ({
        tone: s.tone,
        useName: s.useName,
        includeStreak: s.includeStreak,
        useEmojis: s.useEmojis,
        wakeTime: s.wakeTime,
        sleepTime: s.sleepTime,
        goals: s.goals,
        habitStacking: s.habitStacking,
        notifications: s.notifications,
        quietHours: s.quietHours,
        plan: s.plan,
      }),
    }
  )
);
