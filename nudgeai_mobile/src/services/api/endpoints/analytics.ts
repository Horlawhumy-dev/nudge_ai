import type {
  BarDatum,
  DayStatus,
  OverdueTask,
  ProgressPeriod,
  TopHabit,
  TopTaskGroup,
} from '@/features/progress/types';

import { api } from '../client';

type ApiBar = { label: string; value: number };

type ApiHabitProgress = {
  bars: ApiBar[];
  streak: number;
  best_streak: number;
  consistency: number;
  all_time_wins: number;
  top_habits: {
    habit_id: string;
    name: string;
    emoji: string;
    streak: number;
    completion: number;
  }[];
  consistency_map: { date: string; status: DayStatus }[];
  insight: string | null;
};

type ApiTaskProgress = {
  bars: ApiBar[];
  done: number;
  total: number;
  completion_rate: number;
  on_time_rate: number;
  overdue: number;
  time_groups: { name: 'Morning' | 'Afternoon' | 'Evening'; completion: number; total: number }[];
  most_overdue: { task_id: string; title: string; days_overdue: number }[];
  insight: string | null;
};

export type HabitProgressView = {
  bars: BarDatum[];
  overview: { streak: number; consistency: number; allTimeWins: number };
  topHabits: TopHabit[];
  map: DayStatus[];
  insight: string | null;
};

export type TaskProgressView = {
  bars: BarDatum[];
  overview: {
    done: number;
    total: number;
    completionRate: number;
    onTimeRate: number;
    overdue: number;
  };
  groups: TopTaskGroup[];
  overdue: OverdueTask[];
  insight: string | null;
};

const GROUP_EMOJI = { Morning: '🌅', Afternoon: '☀️', Evening: '🌃' } as const;

export function habitProgressFromApi(p: ApiHabitProgress): HabitProgressView {
  return {
    bars: p.bars,
    overview: { streak: p.streak, consistency: p.consistency, allTimeWins: p.all_time_wins },
    topHabits: p.top_habits.map((h, i) => ({
      id: h.habit_id,
      emoji: h.emoji,
      name: h.name,
      streak: h.streak,
      completion: h.completion,
      accentIndex: i,
    })),
    map: p.consistency_map.map((d) => d.status),
    insight: p.insight,
  };
}

export function taskProgressFromApi(p: ApiTaskProgress): TaskProgressView {
  return {
    bars: p.bars,
    overview: {
      done: p.done,
      total: p.total,
      completionRate: p.completion_rate,
      onTimeRate: p.on_time_rate,
      overdue: p.overdue,
    },
    groups: p.time_groups
      .filter((g) => g.total > 0)
      .map((g, i) => ({
        id: g.name,
        emoji: GROUP_EMOJI[g.name],
        name: g.name,
        completion: g.completion,
        accentIndex: i,
      })),
    overdue: p.most_overdue.map((t) => ({
      id: t.task_id,
      icon: 'document-text-outline',
      title: t.title,
      times: Math.max(1, t.days_overdue),
    })),
    insight: p.insight,
  };
}

const periodParam = (p: ProgressPeriod) => (p === 'Weekly' ? 'weekly' : 'monthly');

export const analyticsApi = {
  async habits(period: ProgressPeriod) {
    const { data } = await api.get<ApiHabitProgress>('/analytics/habits', {
      params: { period: periodParam(period), phrase: true },
    });
    return habitProgressFromApi(data);
  },
  async tasks(period: ProgressPeriod) {
    const { data } = await api.get<ApiTaskProgress>('/analytics/tasks', {
      params: { period: periodParam(period), phrase: true },
    });
    return taskProgressFromApi(data);
  },
};
