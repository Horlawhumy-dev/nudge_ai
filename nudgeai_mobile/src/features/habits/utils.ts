import type { Habit } from './types';

export function habitProgress(habit: Pick<Habit, 'daysDone' | 'goalDays'>): number {
  return habit.goalDays > 0 ? Math.min(1, habit.daysDone / habit.goalDays) : 0;
}

export function completedCount(habits: readonly Habit[]): number {
  return habits.filter((h) => h.completedToday).length;
}
