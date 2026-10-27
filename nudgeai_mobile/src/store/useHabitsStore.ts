import { create } from 'zustand';

import { seedHabits } from '@/features/habits/data';
import type { Habit, HabitDraft } from '@/features/habits/types';
import { createId } from '@/lib/format';
import { colors } from '@/theme';

type HabitsState = {
  habits: Habit[];
  streak: number;
  addHabit: (draft: HabitDraft) => Habit;
  toggleHabit: (id: string) => void;
  removeHabit: (id: string) => void;
  /** Replace local data with the demo account's habits. */
  seedDemo: () => void;
  /** Start from a blank slate (fresh sign-up). */
  clear: () => void;
};

export const useHabitsStore = create<HabitsState>((set, get) => ({
  habits: [],
  streak: 0,

  addHabit: (draft) => {
    const habit: Habit = {
      ...draft,
      id: createId('habit'),
      completedToday: false,
      daysDone: 0,
      goalDays: draft.frequency === 'Weekly' ? 1 : draft.frequency === 'Weekdays' ? 5 : 7,
      accentIndex: get().habits.length % colors.accents.length,
    };
    set((s) => ({ habits: [...s.habits, habit] }));
    return habit;
  },

  toggleHabit: (id) =>
    set((s) => ({
      habits: s.habits.map((h) => {
        if (h.id !== id) return h;
        const completedToday = !h.completedToday;
        return {
          ...h,
          completedToday,
          daysDone: Math.max(0, Math.min(h.goalDays, h.daysDone + (completedToday ? 1 : -1))),
        };
      }),
    })),

  removeHabit: (id) =>
    set((s) => ({
      habits: s.habits
        .filter((h) => h.id !== id)
        .map((h) => (h.stackedAfter === id ? { ...h, stackedAfter: undefined } : h)),
    })),

  seedDemo: () => set({ habits: seedHabits, streak: 7 }),
  clear: () => set({ habits: [], streak: 0 }),
}));
