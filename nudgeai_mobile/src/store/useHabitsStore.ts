import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { buildSeedHabits } from '@/features/habits/data';
import { GOAL_DAYS, type Habit, type HabitDraft } from '@/features/habits/types';
import { dateKey } from '@/lib/date';
import { createId } from '@/lib/format';
import { colors } from '@/theme';

import { persistStorage } from './persist';

type HabitsState = {
  habits: Habit[];
  addHabit: (draft: HabitDraft) => Habit;
  updateHabit: (id: string, patch: Partial<HabitDraft>) => void;
  /** Tick or untick a habit for `now`'s calendar day. Returns whether it is now done. */
  toggleHabit: (id: string, now?: Date) => boolean;
  /** Removes the habit and returns what's needed to undo it. */
  removeHabit: (id: string) => { habit: Habit; index: number } | null;
  restoreHabit: (habit: Habit, index: number) => void;
  /** Replace local data with the demo account's habits. */
  seedDemo: () => void;
  /** Start from a blank slate (fresh sign-up). */
  clear: () => void;
};

export const useHabitsStore = create<HabitsState>()(
  persist(
    (set, get) => ({
      habits: [],

      addHabit: (draft) => {
        const habit: Habit = {
          ...draft,
          id: createId('habit'),
          goalDays: GOAL_DAYS[draft.frequency],
          accentIndex: get().habits.length % colors.accents.length,
          completions: [],
        };
        set((s) => ({ habits: [...s.habits, habit] }));
        return habit;
      },

      updateHabit: (id, patch) =>
        set((s) => ({
          habits: s.habits.map((h) =>
            h.id === id
              ? {
                  ...h,
                  ...patch,
                  goalDays: patch.frequency ? GOAL_DAYS[patch.frequency] : h.goalDays,
                }
              : h
          ),
        })),

      toggleHabit: (id, now = new Date()) => {
        const key = dateKey(now);
        let done = false;
        set((s) => ({
          habits: s.habits.map((h) => {
            if (h.id !== id) return h;
            const has = h.completions.includes(key);
            done = !has;
            return {
              ...h,
              completions: has ? h.completions.filter((k) => k !== key) : [...h.completions, key],
            };
          }),
        }));
        return done;
      },

      removeHabit: (id) => {
        const { habits } = get();
        const index = habits.findIndex((h) => h.id === id);
        if (index < 0) return null;
        const habit = habits[index];
        set({
          habits: habits
            .filter((h) => h.id !== id)
            .map((h) => (h.stackedAfter === id ? { ...h, stackedAfter: undefined } : h)),
        });
        return { habit, index };
      },

      restoreHabit: (habit, index) =>
        set((s) => {
          const next = [...s.habits];
          next.splice(Math.min(index, next.length), 0, habit);
          return { habits: next };
        }),

      seedDemo: () => set({ habits: buildSeedHabits() }),
      clear: () => set({ habits: [] }),
    }),
    {
      name: 'nudge.habits',
      // v2 replaced completedToday/daysDone with dated completions; v3 dropped the stored streak
      // (it's derived now). Older saves are dropped.
      version: 3,
      migrate: () => ({ habits: [] }),
      storage: persistStorage,
      partialize: (s) => ({ habits: s.habits }),
    }
  )
);
