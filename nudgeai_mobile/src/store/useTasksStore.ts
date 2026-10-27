import { create } from 'zustand';

import { seedTasks } from '@/features/tasks/data';
import type { Task, TaskDraft } from '@/features/tasks/types';
import { formatClock } from '@/features/tasks/utils';
import { createId } from '@/lib/format';

type TasksState = {
  tasks: Task[];
  addTask: (draft: TaskDraft) => Task;
  toggleTask: (id: string) => void;
  removeTask: (id: string) => void;
  seedDemo: () => void;
  clear: () => void;
};

/** "14:30" + 1h → "3:30 pm" */
function plusOneHour(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  return formatClock(`${(Number(match[1]) + 1) % 24}:${match[2]}`);
}

export const useTasksStore = create<TasksState>((set) => ({
  tasks: [],

  addTask: (draft) => {
    const task: Task = {
      id: createId('task'),
      title: draft.title.trim(),
      startTime: draft.time ? formatClock(draft.time) : 'Anytime',
      endTime: draft.time ? plusOneHour(draft.time) : '',
      priority: draft.priority,
      notes: draft.notes.trim() || undefined,
      repeat: draft.repeat,
      done: false,
      overdue: false,
    };
    set((s) => ({ tasks: [...s.tasks, task] }));
    return task;
  },

  toggleTask: (id) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done, overdue: t.done ? t.overdue : false } : t)),
    })),

  removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

  seedDemo: () => set({ tasks: seedTasks }),
  clear: () => set({ tasks: [] }),
}));
