import { addDays, dateKey } from '@/lib/date';

import { buildSeedHabits } from '../data';
import {
  allDoneToday,
  completedCount,
  daysDone,
  habitProgress,
  habitStreak,
  isDoneToday,
  weekDots,
} from '../utils';

const now = new Date(2026, 4, 13, 9);
const ago = (n: number) => dateKey(addDays(now, -n));

describe('habit utils', () => {
  it('derives today state from dated completions', () => {
    expect(isDoneToday({ completions: [ago(0)] }, now)).toBe(true);
    expect(isDoneToday({ completions: [ago(1)] }, now)).toBe(false);
    // the same record is "not done" the next day: nothing stale to reset
    expect(isDoneToday({ completions: [ago(0)] }, addDays(now, 1))).toBe(false);
  });

  it('counts completions inside the 7-day window only', () => {
    const h = { completions: [ago(0), ago(3), ago(6), ago(7), ago(20)] };
    expect(daysDone(h, now)).toBe(3);
    expect(habitProgress({ ...h, goalDays: 6 }, now)).toBeCloseTo(0.5);
    expect(habitProgress({ completions: [], goalDays: 0 }, now)).toBe(0);
  });

  it('computes streaks, keeping yesterday alive until today is missed', () => {
    expect(habitStreak({ completions: [ago(0), ago(1), ago(2)] }, now)).toBe(3);
    expect(habitStreak({ completions: [ago(1), ago(2)] }, now)).toBe(2);
    expect(habitStreak({ completions: [ago(2), ago(3)] }, now)).toBe(0);
    expect(habitStreak({ completions: [ago(0), ago(2)] }, now)).toBe(1);
  });

  it('builds a 7-day strip ending today', () => {
    const dots = weekDots({ completions: [ago(0), ago(2)] }, now);
    expect(dots).toHaveLength(7);
    expect(dots[6]).toMatchObject({ isToday: true, done: true });
    expect(dots[4].done).toBe(true);
    expect(dots[5].done).toBe(false);
  });

  it('matches the design seeds: 2 of 4 done today', () => {
    const habits = buildSeedHabits(now);
    expect(completedCount(habits, now)).toBe(2);
    expect(allDoneToday(habits, now)).toBe(false);
    expect(allDoneToday([], now)).toBe(false);
  });
});
