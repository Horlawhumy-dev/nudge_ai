import type { DateKey } from '@/lib/date';

export type TaskPriority = 'High' | 'Medium' | 'Low';
export type TaskFilter = 'All' | 'Completed' | 'Upcoming' | 'Overdue';
export type TaskStatus = 'overdue' | 'completed' | 'upcoming';

export type Task = {
  id: string;
  title: string;
  date: DateKey;
  /** 24h "HH:mm", or null for an all-day task. */
  startTime: string | null;
  endTime: string | null;
  priority: TaskPriority;
  done: boolean;
  notes?: string;
  repeat?: boolean;
};

export type TaskDraft = {
  title: string;
  date: DateKey;
  time: string | null;
  priority: TaskPriority;
  notes: string;
  repeat: boolean;
};
