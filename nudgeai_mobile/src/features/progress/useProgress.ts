import { useEffect, useRef, useState } from 'react';

import { DEMO_MODE } from '@/constants/env';
import {
  analyticsApi,
  type HabitProgressView,
  type TaskProgressView,
} from '@/services/api/endpoints/analytics';
import { useHabitsStore } from '@/store/useHabitsStore';
import { useTasksStore } from '@/store/useTasksStore';

import {
  buildConsistencyMap,
  habitBars,
  habitInsight,
  habitOverview,
  overdueTasks,
  taskBars,
  taskInsight,
  taskOverview,
  topHabits,
  topTaskGroups,
} from './data';
import type { ProgressPeriod } from './types';

export type Remote<T> = {
  /** Fetch again now (pull-to-refresh). Resolves when done; rejects if the fetch failed. */
  reload: () => Promise<void>;
  data: T | null;
  /** First load for this view: nothing to show yet. */
  loading: boolean;
  /** The last refresh failed (stale data, if any, is still in `data`). */
  error: boolean;
  /** True in demo mode: the numbers are made up. */
  sample: boolean;
};

/** Last answer per view, so flipping tabs and periods shows something at once. */
const cache = new Map<string, unknown>();

function useServerView<T>(
  key: string,
  enabled: boolean,
  fetcher: () => Promise<T>,
  refreshOn: number
): Omit<Remote<T>, 'sample'> {
  const [settled, setSettled] = useState<{ key: string; error: boolean } | null>(null);
  const [, bump] = useState(0);
  const [reloads, setReloads] = useState(0);
  const waiting = useRef<{ resolve: () => void; reject: (e: unknown) => void }[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetcher().then(
      (value) => {
        cache.set(key, value);
        waiting.current.splice(0).forEach((w) => w.resolve());
        if (!cancelled) {
          setSettled({ key, error: false });
          bump((n) => n + 1);
        }
      },
      (e: unknown) => {
        waiting.current.splice(0).forEach((w) => w.reject(e));
        if (!cancelled) setSettled({ key, error: true });
      }
    );
    return () => {
      cancelled = true;
    };
    // `fetcher` is rebuilt every render; the key and refreshOn say when to fetch again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, refreshOn, reloads]);

  const data = (cache.get(key) as T | undefined) ?? null;
  const mine = settled?.key === key ? settled : null;
  const reload = () =>
    new Promise<void>((resolve, reject) => {
      if (!enabled) return resolve();
      waiting.current.push({ resolve, reject });
      setReloads((n) => n + 1);
    });
  return {
    data,
    loading: enabled && data === null && mine === null,
    error: mine?.error ?? false,
    reload,
  };
}

/** Habit progress. From the server for an account; sample figures in demo mode. */
export function useHabitProgress(
  period: ProgressPeriod,
  today: Date,
  enabled: boolean
): Remote<HabitProgressView> {
  // A check-in elsewhere changes the numbers, so it triggers a fresh fetch.
  const checkIns = useHabitsStore((s) => s.habits.reduce((n, h) => n + h.completions.length, 0));
  const live = useServerView(
    `habits:${period}`,
    enabled && !DEMO_MODE,
    () => analyticsApi.habits(period),
    checkIns
  );
  if (!DEMO_MODE) return { ...live, sample: false };
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return {
    data: {
      bars: habitBars[period],
      overview: {
        streak: habitOverview.streak,
        consistency: habitOverview.consistency,
        allTimeWins: habitOverview.allTimeWins,
      },
      topHabits,
      map: buildConsistencyMap(daysInMonth, today.getDate() - 1),
      insight: habitInsight,
    },
    loading: false,
    error: false,
    sample: true,
    reload: async () => undefined,
  };
}

/** Task progress. From the server for an account; sample figures in demo mode. */
export function useTaskProgress(
  period: ProgressPeriod,
  enabled: boolean
): Remote<TaskProgressView> {
  const done = useTasksStore((s) => s.tasks.filter((t) => t.done).length);
  const live = useServerView(
    `tasks:${period}`,
    enabled && !DEMO_MODE,
    () => analyticsApi.tasks(period),
    done
  );
  if (!DEMO_MODE) return { ...live, sample: false };
  return {
    data: {
      bars: taskBars[period],
      overview: taskOverview,
      groups: topTaskGroups,
      overdue: overdueTasks,
      insight: taskInsight,
    },
    loading: false,
    error: false,
    sample: true,
    reload: async () => undefined,
  };
}
