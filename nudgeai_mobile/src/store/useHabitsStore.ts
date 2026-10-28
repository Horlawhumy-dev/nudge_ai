import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEMO_MODE } from '@/constants/env';
import { buildSeedHabits } from '@/features/habits/data';
import { GOAL_DAYS, type Habit, type HabitDraft } from '@/features/habits/types';
import { dateKey } from '@/lib/date';
import { createId } from '@/lib/format';
import { habitsApi } from '@/services/api/endpoints/habits';
import { colors } from '@/theme';

import { persistStorage } from './persist';
import { reportFailure, resolveId, serial, trackNew } from './remote';

type HabitsState = {
  habits: Habit[];
  addHabit: (draft: HabitDraft) => Habit;
  updateHabit: (id: string, patch: Partial<HabitDraft>) => void;
  /** Tick or untick a habit for `now`'s calendar day. Returns whether it is now done. */
  toggleHabit: (id: string, now?: Date) => boolean;
  /** Removes the habit and returns what's needed to undo it. */
  removeHabit: (id: string) => { habit: Habit; index: number } | null;
  restoreHabit: (habit: Habit, index: number) => void;
  /** Replace everything with the server's copy (after sign-in or a refresh). */
  replaceAll: (habits: Omit<Habit, 'accentIndex'>[]) => void;
  /** Replace local data with the demo account's habits. */
  seedDemo: () => void;
  /** Start from a blank slate (fresh sign-up). */
  clear: () => void;
};

function insertAt(
  set: (fn: (s: HabitsState) => Partial<HabitsState>) => void,
  habit: Habit,
  index: number
) {
  set((s) => {
    const next = [...s.habits];
    next.splice(Math.min(index, next.length), 0, habit);
    return { habits: next };
  });
}

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
        if (!DEMO_MODE) {
          const serverId = (async () => {
            const stackedAfter = draft.stackedAfter
              ? await resolveId(draft.stackedAfter)
              : undefined;
            return (await habitsApi.create({ ...draft, stackedAfter })).id;
          })();
          trackNew(habit.id, serverId);
          serverId.then(
            (real) =>
              set((s) => ({
                habits: s.habits.map((h) =>
                  h.id === habit.id
                    ? { ...h, id: real }
                    : h.stackedAfter === habit.id
                      ? { ...h, stackedAfter: real }
                      : h
                ),
              })),
            (e: unknown) => {
              set((s) => ({ habits: s.habits.filter((h) => h.id !== habit.id) }));
              reportFailure(e, 'Couldn’t save that habit. Check your connection and try again.');
            }
          );
        }
        return habit;
      },

      updateHabit: (id, patch) => {
        const before = get().habits.find((h) => h.id === id);
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
        }));
        if (DEMO_MODE || !before) return;
        serial(id, async () => {
          const body = { ...patch };
          if (body.stackedAfter) body.stackedAfter = await resolveId(body.stackedAfter);
          await habitsApi.update(await resolveId(id), body);
        }).catch((e: unknown) => {
          set((s) => ({ habits: s.habits.map((h) => (h.id === id ? before : h)) }));
          reportFailure(e, 'Couldn’t save your changes. Check your connection and try again.');
        });
      },

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
        if (!DEMO_MODE) {
          serial(id, async () => habitsApi.check(await resolveId(id), key, done)).catch(
            (e: unknown) => {
              const undo = (h: Habit): Habit => ({
                ...h,
                completions: done
                  ? h.completions.filter((k) => k !== key)
                  : [...h.completions, key],
              });
              set((s) => ({ habits: s.habits.map((h) => (h.id === id ? undo(h) : h)) }));
              reportFailure(e, 'Couldn’t save that check-in. Check your connection and try again.');
            }
          );
        }
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
        if (!DEMO_MODE) {
          serial(id, async () => habitsApi.remove(await resolveId(id))).catch((e: unknown) => {
            insertAt(set, habit, index);
            reportFailure(e, 'Couldn’t delete that habit. Check your connection and try again.');
          });
        }
        return { habit, index };
      },

      restoreHabit: (habit, index) => {
        insertAt(set, habit, index);
        if (DEMO_MODE) return;
        serial(habit.id, async () => habitsApi.restore(await resolveId(habit.id))).catch(
          (e: unknown) => {
            set((s) => ({ habits: s.habits.filter((h) => h.id !== habit.id) }));
            reportFailure(e, 'Couldn’t undo that. Check your connection and try again.');
          }
        );
      },

      replaceAll: (habits) =>
        set({
          habits: habits.map((h, i) => ({ ...h, accentIndex: i % colors.accents.length })),
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
