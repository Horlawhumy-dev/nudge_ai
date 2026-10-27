import { addDays, dateKey } from '@/lib/date';

import type { Habit } from './types';

/** Seeds mirror the design cards: two ticked today, two open, with varied recent history. */
export function buildSeedHabits(now: Date = new Date()): Habit[] {
  const ago = (n: number) => dateKey(addDays(now, -n));
  return [
    {
      id: 'habit_workout',
      name: 'Morning Workout',
      emoji: '💪',
      category: 'Fitness',
      timeOfDay: 'Morning',
      frequency: 'Daily',
      goalDays: 7,
      accentIndex: 0,
      completions: [ago(0)],
    },
    {
      id: 'habit_reading',
      name: 'Reading 20 mins',
      emoji: '📚',
      category: 'Learning',
      timeOfDay: 'Evening',
      frequency: 'Daily',
      goalDays: 5,
      accentIndex: 1,
      completions: [ago(0), ago(1), ago(2)],
    },
    {
      id: 'habit_water',
      name: 'Drink Water',
      emoji: '💧',
      category: 'Hydration',
      timeOfDay: 'Afternoon',
      frequency: 'Daily',
      goalDays: 7,
      accentIndex: 2,
      completions: [ago(1)],
    },
    {
      id: 'habit_fruits',
      name: 'Eat fruits',
      emoji: '🍎',
      category: 'Nutrition',
      timeOfDay: 'Evening',
      frequency: 'Daily',
      goalDays: 6,
      accentIndex: 3,
      completions: [ago(2)],
    },
  ];
}
