import { dateKey, formatRelativeDate, parseDateKey } from '@/lib/date';

import type { Task, TaskFilter, TaskStatus } from './types';

/** Free plan limit from the subscription screen. */
export const FREE_TASK_LIMIT = 5;

/** "2:30 pm" from a 24h "14:30"; passes through anything that is already display text. */
export function formatClock(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return value;
  const h = Number(match[1]);
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${h % 12 === 0 ? 12 : h % 12}:${match[2]} ${suffix}`;
}

/** "14:30" + 1 hour → "15:30" (wraps past midnight). */
export function plusOneHour(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  return `${String((Number(match[1]) + 1) % 24).padStart(2, '0')}:${match[2]}`;
}

/** "9:00 am - 10:45 am", "2:00 pm", or "All day". */
export function formatTimeRange(task: Pick<Task, 'startTime' | 'endTime'>): string {
  if (!task.startTime) return 'All day';
  const start = formatClock(task.startTime);
  return task.endTime ? `${start} - ${formatClock(task.endTime)}` : start;
}

/** The moment a task is due: its end time, else start time, else the end of its day. */
export function dueAt(task: Pick<Task, 'date' | 'startTime' | 'endTime'>): Date {
  const day = parseDateKey(task.date);
  const clock = task.endTime ?? task.startTime ?? '23:59';
  const [h, m] = clock.split(':').map(Number);
  day.setHours(h, m, 0, 0);
  return day;
}

export function taskStatus(task: Task, now: Date = new Date()): TaskStatus {
  if (task.done) return 'completed';
  return dueAt(task).getTime() < now.getTime() ? 'overdue' : 'upcoming';
}

export function matchesFilter(task: Task, filter: TaskFilter, now: Date = new Date()): boolean {
  if (filter === 'All') return true;
  return taskStatus(task, now) === filter.toLowerCase();
}

/** Tasks worth showing: anything overdue, or dated today or later. Old completed ones drop off. */
export function isVisible(task: Task, now: Date = new Date()): boolean {
  return taskStatus(task, now) === 'overdue' || task.date >= dateKey(now);
}

/** Today's working list: dated today, plus anything overdue that still needs doing. */
export function isForToday(task: Task, now: Date = new Date()): boolean {
  return task.date === dateKey(now) || taskStatus(task, now) === 'overdue';
}

/** "Today" is implied on the Tasks screen; other days get a label. */
export function dayLabel(task: Task, now: Date = new Date()): string | null {
  return task.date === dateKey(now) ? null : formatRelativeDate(task.date, now);
}

export type TaskSection = { status: TaskStatus; title: string; tasks: Task[] };

const SECTION_ORDER: readonly { status: TaskStatus; title: string }[] = [
  { status: 'overdue', title: 'Overdue' },
  { status: 'completed', title: 'Completed' },
  { status: 'upcoming', title: 'Upcoming' },
];

function byDue(a: Task, b: Task): number {
  return dueAt(a).getTime() - dueAt(b).getTime();
}

/** Groups tasks into Overdue / Completed / Upcoming (each ordered by due time), dropping empty ones. */
export function groupTasks(tasks: readonly Task[], now: Date = new Date()): TaskSection[] {
  return SECTION_ORDER.map((s) => ({
    ...s,
    tasks: tasks.filter((t) => taskStatus(t, now) === s.status).sort(byDue),
  })).filter((s) => s.tasks.length > 0);
}

export function doneCount(tasks: readonly Task[]): number {
  return tasks.filter((t) => t.done).length;
}
