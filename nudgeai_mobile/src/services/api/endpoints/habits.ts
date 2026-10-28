import { GOAL_DAYS, type Habit, type HabitDraft } from '@/features/habits/types';
import type { DateKey } from '@/lib/date';

import { api } from '../client';
import type { ApiCompletions, ApiHabit } from '../types';

const capitalise = <T extends string>(s: string) => (s.charAt(0).toUpperCase() + s.slice(1)) as T;

/** Server habit → the shape the screens use. `accentIndex` is assigned by the store. */
export function habitFromApi(h: ApiHabit, completions: DateKey[]): Omit<Habit, 'accentIndex'> {
  return {
    id: h.id,
    name: h.name,
    emoji: h.emoji,
    category: h.category ?? 'General',
    timeOfDay: capitalise(h.time_of_day),
    frequency: capitalise(h.frequency),
    goalDays: h.goal_days,
    stackedAfter: h.stacked_after_id ?? undefined,
    completions,
  };
}

export function habitToApi(d: Partial<HabitDraft>) {
  return {
    ...(d.name !== undefined && { name: d.name.trim() }),
    ...(d.emoji !== undefined && { emoji: d.emoji }),
    ...(d.category !== undefined && { category: d.category }),
    ...(d.timeOfDay !== undefined && { time_of_day: d.timeOfDay.toLowerCase() }),
    ...(d.frequency !== undefined && {
      frequency: d.frequency.toLowerCase(),
      goal_days: GOAL_DAYS[d.frequency],
    }),
    ...('stackedAfter' in d && { stacked_after_id: d.stackedAfter ?? null }),
  };
}

export const habitsApi = {
  async list() {
    const { data } = await api.get<ApiHabit[]>('/habits');
    return data;
  },

  /** Check-in dates for every habit over the last 90 days (the backend's default window). */
  async completions() {
    const { data } = await api.get<ApiCompletions>('/habits/completions');
    return data.days;
  },

  async create(draft: HabitDraft) {
    const { data } = await api.post<ApiHabit>('/habits', habitToApi(draft));
    return data;
  },

  async update(id: string, patch: Partial<HabitDraft>) {
    const { data } = await api.patch<ApiHabit>(`/habits/${id}`, habitToApi(patch));
    return data;
  },

  async remove(id: string) {
    await api.delete(`/habits/${id}`);
  },

  async restore(id: string) {
    await api.post(`/habits/${id}/restore`);
  },

  /** Idempotent, so a retry or a double tap never double counts. */
  async check(id: string, on: DateKey, done: boolean) {
    await api.post(`/habits/${id}/${done ? 'complete' : 'uncomplete'}`, { on });
  },
};
