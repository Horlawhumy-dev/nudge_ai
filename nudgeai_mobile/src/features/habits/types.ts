import type { DateKey } from '@/lib/date';

export type TimeOfDay = 'Morning' | 'Afternoon' | 'Evening';
export type HabitFrequency = 'Daily' | 'Weekdays' | 'Weekly';

export type Habit = {
  id: string;
  name: string;
  emoji: string;
  category: string;
  timeOfDay: TimeOfDay;
  frequency: HabitFrequency;
  /** Completions wanted per rolling 7 days (the "x/7 days" figure on cards). */
  goalDays: number;
  /** Index into `colors.accents`; keeps a habit's bar colour stable. */
  accentIndex: number;
  /** Id of the habit that triggers this one (habit stacking). */
  stackedAfter?: string;
  /** Every day this habit was ticked, as local date keys. Today's state derives from this. */
  completions: DateKey[];
};

export type HabitDraft = Pick<
  Habit,
  'name' | 'emoji' | 'category' | 'timeOfDay' | 'frequency' | 'stackedAfter'
>;

export const GOAL_DAYS: Record<HabitFrequency, number> = { Daily: 7, Weekdays: 5, Weekly: 1 };
