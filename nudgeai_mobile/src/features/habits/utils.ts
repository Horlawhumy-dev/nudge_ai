import { addDays, dateKey, type DateKey } from '@/lib/date';

import { FREE_HABIT_LIMIT } from './constants';
import type { Habit } from './types';

/** Progress is counted over the last 7 days, today included. */
export const WINDOW_DAYS = 7;

export function isDoneOn(habit: Pick<Habit, 'completions'>, key: DateKey): boolean {
  return habit.completions.includes(key);
}

export function isDoneToday(habit: Pick<Habit, 'completions'>, now: Date = new Date()): boolean {
  return isDoneOn(habit, dateKey(now));
}

/** Completions inside the rolling 7-day window. */
export function daysDone(habit: Pick<Habit, 'completions'>, now: Date = new Date()): number {
  const window = new Set(Array.from({ length: WINDOW_DAYS }, (_, i) => dateKey(addDays(now, -i))));
  return habit.completions.filter((k) => window.has(k)).length;
}

export function habitProgress(
  habit: Pick<Habit, 'completions' | 'goalDays'>,
  now: Date = new Date()
): number {
  return habit.goalDays > 0 ? Math.min(1, daysDone(habit, now) / habit.goalDays) : 0;
}

/** Consecutive days ticked, ending today (or yesterday while today is still open). */
export function habitStreak(habit: Pick<Habit, 'completions'>, now: Date = new Date()): number {
  const done = new Set(habit.completions);
  let cursor = done.has(dateKey(now)) ? now : addDays(now, -1);
  let streak = 0;
  while (done.has(dateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export type WeekDot = { key: DateKey; label: string; done: boolean; isToday: boolean };

const LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** The last 7 days, oldest first, for the detail screen's strip. */
export function weekDots(habit: Pick<Habit, 'completions'>, now: Date = new Date()): WeekDot[] {
  return Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const day = addDays(now, i - (WINDOW_DAYS - 1));
    const key = dateKey(day);
    return {
      key,
      label: LABELS[day.getDay()],
      done: isDoneOn(habit, key),
      isToday: i === WINDOW_DAYS - 1,
    };
  });
}

export function completedCount(habits: readonly Habit[], now: Date = new Date()): number {
  return habits.filter((h) => isDoneToday(h, now)).length;
}

export function allDoneToday(habits: readonly Habit[], now: Date = new Date()): boolean {
  return habits.length > 0 && completedCount(habits, now) === habits.length;
}

/** How many more habits the plan allows (Infinity on Pro). Free is capped, and the server enforces it. */
export function habitRoom(plan: 'free' | 'pro', existing: number): number {
  return plan === 'pro' ? Number.POSITIVE_INFINITY : Math.max(0, FREE_HABIT_LIMIT - existing);
}
