import { addDays, dateKey } from '@/lib/date';

import { buildSeedHabits } from '../data';
import {
  activeDays,
  bestStreak,
  MILESTONES,
  nextMilestone,
  overallStreak,
  weekActivity,
} from '../streak';

const now = new Date(2026, 4, 13, 9);
const ago = (n: number) => dateKey(addDays(now, -n));
const h = (...days: number[]) => ({ completions: days.map(ago) });

describe('overall streak', () => {
  it('counts consecutive days across all habits', () => {
    expect(overallStreak([h(0, 1), h(2)], now)).toBe(3);
    expect(overallStreak([h(0), h(2)], now)).toBe(1); // gap yesterday
  });

  it('keeps yesterday alive until today is missed', () => {
    expect(overallStreak([h(1, 2, 3)], now)).toBe(3);
    expect(overallStreak([h(2, 3)], now)).toBe(0);
    expect(overallStreak([], now)).toBe(0);
  });

  it('is 7 for the demo data', () => {
    expect(overallStreak(buildSeedHabits(now), now)).toBe(7);
  });

  it('finds the best run ever', () => {
    expect(bestStreak([h(0, 1), h(10, 11, 12, 13)])).toBe(4);
    expect(bestStreak([h(5), h(9)])).toBe(1);
    expect(bestStreak([])).toBe(0);
  });

  it('builds a week strip from any activity', () => {
    const strip = weekActivity([h(0), h(2)], now);
    expect(strip).toHaveLength(7);
    expect(strip[6]).toMatchObject({ isToday: true, done: true });
    expect(strip[4].done).toBe(true);
    expect(strip[5].done).toBe(false);
    expect(activeDays([h(0, 0)]).size).toBe(1);
  });

  it('finds the next milestone', () => {
    expect(nextMilestone(0)).toBe(MILESTONES[0]);
    expect(nextMilestone(7)).toBe(14);
    expect(nextMilestone(100)).toBeNull();
  });
});
