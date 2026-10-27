import type { Task, TaskFilter, TaskStatus } from './types';

export function taskStatus(task: Task): TaskStatus {
  if (task.done) return 'completed';
  return task.overdue ? 'overdue' : 'upcoming';
}

export function matchesFilter(task: Task, filter: TaskFilter): boolean {
  if (filter === 'All') return true;
  return taskStatus(task) === filter.toLowerCase();
}

export type TaskSection = { status: TaskStatus; title: string; tasks: Task[] };

const SECTION_ORDER: readonly { status: TaskStatus; title: string }[] = [
  { status: 'overdue', title: 'Overdue' },
  { status: 'completed', title: 'Completed' },
  { status: 'upcoming', title: 'Upcoming' },
];

/** Groups tasks into the Overdue / Completed / Upcoming sections, dropping empty ones. */
export function groupTasks(tasks: readonly Task[]): TaskSection[] {
  return SECTION_ORDER.map((s) => ({ ...s, tasks: tasks.filter((t) => taskStatus(t) === s.status) })).filter(
    (s) => s.tasks.length > 0
  );
}

export function doneCount(tasks: readonly Task[]): number {
  return tasks.filter((t) => t.done).length;
}

/** Free plan limit from the subscription screen. */
export const FREE_TASK_LIMIT = 5;

/** "2:30 pm" from a 24h "14:30"; passes through anything that is already display text. */
export function formatClock(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return value;
  const h = Number(match[1]);
  const m = match[2];
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${suffix}`;
}
