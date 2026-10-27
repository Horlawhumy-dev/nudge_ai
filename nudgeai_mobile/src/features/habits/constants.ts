import type { HabitFrequency, TimeOfDay } from './types';

export const HABIT_ICONS = ['💪', '🍎', '📚', '💧', '🧠', '✍️', '🎯', '😴', '🧘', '💼'] as const;

export const HABIT_CATEGORIES = [
  'Fitness',
  'Learning',
  'Productivity',
  'Health',
  'Mindfulness',
  'Hydration',
] as const;

export const TIMES_OF_DAY: readonly { value: TimeOfDay; emoji: string }[] = [
  { value: 'Morning', emoji: '🌅' },
  { value: 'Afternoon', emoji: '☀️' },
  { value: 'Evening', emoji: '🌃' },
];

export const FREQUENCIES: readonly HabitFrequency[] = ['Daily', 'Weekdays', 'Weekly'];

export const HABIT_FILTERS = ['All', 'Morning', 'Afternoon', 'Evening'] as const;
export type HabitFilter = (typeof HABIT_FILTERS)[number];

/** Free plan limit from the subscription screen. */
export const FREE_HABIT_LIMIT = 3;
