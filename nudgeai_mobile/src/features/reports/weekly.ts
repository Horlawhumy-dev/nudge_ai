import type { Habit } from '@/features/habits/types';
import { daysDone, WINDOW_DAYS } from '@/features/habits/utils';
import type { Task } from '@/features/tasks/types';
import { addDays, dateKey, parseDateKey } from '@/lib/date';

export type WeeklyReport = {
  /** 0–100: check-ins against the combined weekly goals. */
  habitRate: number;
  checkIns: number;
  possible: number;
  tasksDone: number;
  tasksTotal: number;
  bestDay: { name: string; count: number } | null;
  topHabit: string | null;
  needsLove: string | null;
  headline: string;
  tips: string[];
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function headlineFor(rate: number, hasHabits: boolean): string {
  if (!hasHabits) return 'Add a habit to get your first report';
  if (rate >= 80) return 'A great week. You’re in a real rhythm';
  if (rate >= 50) return 'A solid week with room to grow';
  if (rate > 0) return 'A quieter week. Small steps still count';
  return 'A fresh start. Check in a habit today';
}

/** Summarises the last 7 days (today included) from habits and tasks. */
export function buildWeeklyReport(
  habits: readonly Habit[],
  tasks: readonly Task[],
  now: Date = new Date()
): WeeklyReport {
  const window = Array.from({ length: WINDOW_DAYS }, (_, i) => dateKey(addDays(now, -i)));
  const inWindow = new Set(window);

  const possible = habits.reduce((sum, h) => sum + h.goalDays, 0);
  const counts = habits.map((h) => ({ habit: h, count: daysDone(h, now) }));
  const checkIns = counts.reduce((sum, c) => sum + c.count, 0);
  const habitRate = possible > 0 ? Math.min(100, Math.round((checkIns / possible) * 100)) : 0;

  const weekTasks = tasks.filter((t) => inWindow.has(t.date));
  const tasksDone = weekTasks.filter((t) => t.done).length;

  const perDay = new Map<string, number>();
  for (const h of habits) {
    for (const key of h.completions) {
      if (inWindow.has(key)) perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }
  }
  const top = [...perDay.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0];
  const bestDay = top ? { name: WEEKDAYS[parseDateKey(top[0]).getDay()], count: top[1] } : null;

  const ranked = [...counts].sort((a, b) => b.count - a.count);
  const topHabit = ranked.length > 0 && ranked[0].count > 0 ? ranked[0].habit.name : null;
  const lowest = ranked[ranked.length - 1];
  const needsLove =
    ranked.length > 1 && lowest.habit.name !== topHabit && lowest.count < lowest.habit.goalDays
      ? lowest.habit.name
      : null;

  const tips: string[] = [];
  if (needsLove && topHabit) tips.push(`Try stacking “${needsLove}” right after “${topHabit}”.`);
  else if (needsLove) tips.push(`Give “${needsLove}” a fixed time of day.`);
  if (bestDay) tips.push(`${bestDay.name} is your strongest day. Plan your hardest habit then.`);
  const overdue = weekTasks.filter((t) => !t.done).length;
  if (overdue > 0)
    tips.push(`${overdue} task${overdue === 1 ? '' : 's'} from this week still need a new time.`);
  if (tips.length === 0) tips.push('Keep going. Consistency matters more than intensity.');

  return {
    habitRate,
    checkIns,
    possible,
    tasksDone,
    tasksTotal: weekTasks.length,
    bestDay,
    topHabit,
    needsLove,
    headline: headlineFor(habitRate, habits.length > 0),
    tips: tips.slice(0, 3),
  };
}

/** "May 7 – May 13" for the subtitle. */
export function reportRange(now: Date = new Date()): string {
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(addDays(now, -(WINDOW_DAYS - 1)))} – ${fmt(now)}`;
}
