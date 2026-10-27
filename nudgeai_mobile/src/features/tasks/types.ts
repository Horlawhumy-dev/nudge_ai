export type TaskPriority = 'High' | 'Medium' | 'Low';
export type TaskFilter = 'All' | 'Completed' | 'Upcoming' | 'Overdue';
export type TaskStatus = 'overdue' | 'completed' | 'upcoming';

export type Task = {
  id: string;
  title: string;
  /** Display strings such as "9:00 am"; real scheduling arrives with the backend. */
  startTime: string;
  endTime: string;
  priority: TaskPriority;
  done: boolean;
  overdue: boolean;
  notes?: string;
  repeat?: boolean;
};

export type TaskDraft = {
  title: string;
  /** ISO-ish "dd/mm/yyyy" text from the form. */
  date: string;
  time: string;
  priority: TaskPriority;
  notes: string;
  repeat: boolean;
};
