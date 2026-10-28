import type { HabitDraft } from '@/features/habits/types';

import { GOALS } from './data';

export type HabitSuggestion = HabitDraft & { id: string; goalId: string };

/** One starter habit per setup goal, written as something small enough to do today. */
const BY_GOAL: Record<string, Omit<HabitSuggestion, 'id' | 'goalId' | 'frequency'>> = {
  fitness: { name: 'Morning workout', emoji: '💪', category: 'Fitness', timeOfDay: 'Morning' },
  reading: { name: 'Read 20 mins', emoji: '📚', category: 'Learning', timeOfDay: 'Evening' },
  'deep-work': {
    name: 'Deep work block',
    emoji: '🧠',
    category: 'Productivity',
    timeOfDay: 'Morning',
  },
  hydration: { name: 'Drink water', emoji: '💧', category: 'Hydration', timeOfDay: 'Afternoon' },
  mindfulness: {
    name: 'Meditate 10 mins',
    emoji: '🧘',
    category: 'Mindfulness',
    timeOfDay: 'Morning',
  },
  sleep: { name: 'Wind down before bed', emoji: '😴', category: 'Health', timeOfDay: 'Evening' },
  journaling: {
    name: 'Evening journal',
    emoji: '✍️',
    category: 'Mindfulness',
    timeOfDay: 'Evening',
  },
  focus: {
    name: 'Plan your top 3 tasks',
    emoji: '🎯',
    category: 'Productivity',
    timeOfDay: 'Morning',
  },
  nutrition: {
    name: 'Eat a piece of fruit',
    emoji: '🍎',
    category: 'Health',
    timeOfDay: 'Afternoon',
  },
  'work-task': {
    name: 'Clear your inbox',
    emoji: '💼',
    category: 'Productivity',
    timeOfDay: 'Morning',
  },
};

/** Fallback when the user picked no goals: a gentle, general starter set. */
const DEFAULT_GOALS = ['hydration', 'focus', 'reading'];

/** Suggestions for the chosen goals (in the order the goals are listed), de-duplicated. */
export function suggestHabits(goalIds: readonly string[]): HabitSuggestion[] {
  const chosen = goalIds.length > 0 ? goalIds : DEFAULT_GOALS;
  return GOALS.filter((g) => chosen.includes(g.id) && BY_GOAL[g.id]).map((g) => ({
    ...BY_GOAL[g.id],
    id: `suggest_${g.id}`,
    goalId: g.id,
    frequency: 'Daily' as const,
  }));
}

/** Free-plan limit on habits: how many we tick by default. */
export const DEFAULT_SELECTED = 3;
