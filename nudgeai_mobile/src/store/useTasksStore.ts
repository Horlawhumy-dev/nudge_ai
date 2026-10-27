import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { buildSeedTasks } from '@/features/tasks/data';
import type { Task, TaskDraft } from '@/features/tasks/types';
import { plusOneHour } from '@/features/tasks/utils';
import { createId } from '@/lib/format';

import { persistStorage } from './persist';

type TasksState = {
  tasks: Task[];
  addTask: (draft: TaskDraft) => Task;
  updateTask: (id: string, draft: TaskDraft) => void;
  toggleTask: (id: string) => boolean;
  /** Removes the task and returns what's needed to undo it. */
  removeTask: (id: string) => { task: Task; index: number } | null;
  restoreTask: (task: Task, index: number) => void;
  seedDemo: () => void;
  clear: () => void;
};

function fromDraft(draft: TaskDraft): Omit<Task, 'id' | 'done'> {
  return {
    title: draft.title.trim(),
    date: draft.date,
    startTime: draft.time,
    endTime: draft.time ? plusOneHour(draft.time) : null,
    priority: draft.priority,
    notes: draft.notes.trim() || undefined,
    repeat: draft.repeat,
  };
}

export const useTasksStore = create<TasksState>()(
  persist(
    (set, get) => ({
      tasks: [],

      addTask: (draft) => {
        const task: Task = { ...fromDraft(draft), id: createId('task'), done: false };
        set((s) => ({ tasks: [...s.tasks, task] }));
        return task;
      },

      updateTask: (id, draft) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...fromDraft(draft) } : t)),
        })),

      toggleTask: (id) => {
        let done = false;
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== id) return t;
            done = !t.done;
            return { ...t, done };
          }),
        }));
        return done;
      },

      removeTask: (id) => {
        const { tasks } = get();
        const index = tasks.findIndex((t) => t.id === id);
        if (index < 0) return null;
        set({ tasks: tasks.filter((t) => t.id !== id) });
        return { task: tasks[index], index };
      },

      restoreTask: (task, index) =>
        set((s) => {
          const next = [...s.tasks];
          next.splice(Math.min(index, next.length), 0, task);
          return { tasks: next };
        }),

      seedDemo: () => set({ tasks: buildSeedTasks() }),
      clear: () => set({ tasks: [] }),
    }),
    {
      name: 'nudge.tasks',
      // v2 replaced display-string times and the overdue flag with dated, 24h tasks.
      version: 2,
      migrate: () => ({ tasks: [] }),
      storage: persistStorage,
      partialize: (s) => ({ tasks: s.tasks }),
    }
  )
);
