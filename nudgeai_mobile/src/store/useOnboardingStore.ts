import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ToneId } from '@/features/onboarding/data';

import { persistStorage, STORE_VERSION } from './persist';

type OnboardingState = {
  name: string;
  wakeTime: string | null;
  goals: string[];
  sleepTime: string | null;
  tone: ToneId | null;

  setName: (name: string) => void;
  setWakeTime: (id: string) => void;
  toggleGoal: (id: string) => void;
  setSleepTime: (id: string) => void;
  setTone: (tone: ToneId) => void;
  reset: () => void;
};

const empty = { name: '', wakeTime: null, goals: [], sleepTime: null, tone: null };

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      ...empty,
      setName: (name) => set({ name }),
      setWakeTime: (wakeTime) => set({ wakeTime }),
      toggleGoal: (id) =>
        set((s) => ({
          goals: s.goals.includes(id) ? s.goals.filter((g) => g !== id) : [...s.goals, id],
        })),
      setSleepTime: (sleepTime) => set({ sleepTime }),
      setTone: (tone) => set({ tone }),
      reset: () => set(empty),
    }),
    {
      name: 'nudge.onboarding',
      version: STORE_VERSION,
      storage: persistStorage,
      partialize: (s) => ({
        name: s.name,
        wakeTime: s.wakeTime,
        goals: s.goals,
        sleepTime: s.sleepTime,
        tone: s.tone,
      }),
    }
  )
);
