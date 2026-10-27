export type TimeOfDay = 'Morning' | 'Afternoon' | 'Evening';
export type HabitFrequency = 'Daily' | 'Weekdays' | 'Weekly';

export type Habit = {
  id: string;
  name: string;
  emoji: string;
  category: string;
  timeOfDay: TimeOfDay;
  frequency: HabitFrequency;
  completedToday: boolean;
  /** Days completed towards `goalDays` in the current cycle. */
  daysDone: number;
  goalDays: number;
  /** Index into `colors.accents`; keeps a habit's bar colour stable. */
  accentIndex: number;
  /** Id of the habit that triggers this one (habit stacking). */
  stackedAfter?: string;
};

export type HabitDraft = Pick<Habit, 'name' | 'emoji' | 'category' | 'timeOfDay' | 'frequency' | 'stackedAfter'>;
