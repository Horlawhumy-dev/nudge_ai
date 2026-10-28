import { addDays, dateKey, type DateKey } from '@/lib/date';

import type { Habit } from './types';
import { WINDOW_DAYS } from './utils';

export const MILESTONES = [3, 7, 14, 30, 60, 100] as const;

/** Every day on which at least one habit was ticked. */
export function activeDays(habits: readonly Pick<Habit, 'completions'>[]): Set<DateKey> {
  return new Set(habits.flatMap((h) => h.completions));
}

/** Consecutive active days ending today (or yesterday while today is still open). */
export function overallStreak(
  habits: readonly Pick<Habit, 'completions'>[],
  now: Date = new Date()
): number {
  const days = activeDays(habits);
  let cursor = days.has(dateKey(now)) ? now : addDays(now, -1);
  let streak = 0;
  while (days.has(dateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** The longest run of consecutive active days ever recorded. */
export function bestStreak(habits: readonly Pick<Habit, 'completions'>[]): number {
  const sorted = [...activeDays(habits)].sort();
  let best = 0;
  let run = 0;
  let previous: Date | null = null;
  for (const key of sorted) {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    run = previous && dateKey(addDays(previous, 1)) === key ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }
  return best;
}

export type ActivityDay = { key: DateKey; label: string; done: boolean; isToday: boolean };
const LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Last 7 days, oldest first: did the user complete anything that day? */
export function weekActivity(
  habits: readonly Pick<Habit, 'completions'>[],
  now: Date = new Date()
): ActivityDay[] {
  const days = activeDays(habits);
  return Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const day = addDays(now, i - (WINDOW_DAYS - 1));
    const key = dateKey(day);
    return {
      key,
      label: LABELS[day.getDay()],
      done: days.has(key),
      isToday: i === WINDOW_DAYS - 1,
    };
  });
}

/** The next milestone above `streak`, or null once the last one is passed. */
export function nextMilestone(streak: number): number | null {
  return MILESTONES.find((m) => m > streak) ?? null;
}
