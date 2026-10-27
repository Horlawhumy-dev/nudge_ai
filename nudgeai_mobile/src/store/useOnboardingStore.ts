import { create } from 'zustand';

import type { ToneId } from '@/features/onboarding/data';

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

export const useOnboardingStore = create<OnboardingState>((set) => ({
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
}));
