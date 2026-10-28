import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEMO_MODE } from '@/constants/env';
import { buildSeedTasks } from '@/features/tasks/data';
import type { Task, TaskDraft } from '@/features/tasks/types';
import { plusOneHour } from '@/features/tasks/utils';
import { createId } from '@/lib/format';
import { tasksApi } from '@/services/api/endpoints/tasks';

import { persistStorage } from './persist';
import { reportFailure, resolveId, serial, trackNew } from './remote';

type TasksState = {
  tasks: Task[];
  addTask: (draft: TaskDraft) => Task;
  updateTask: (id: string, draft: TaskDraft) => void;
  toggleTask: (id: string) => boolean;
  /** Removes the task and returns what's needed to undo it. */
  removeTask: (id: string) => { task: Task; index: number } | null;
  restoreTask: (task: Task, index: number) => void;
  /** Replace everything with the server's copy (after sign-in or a refresh). */
  replaceAll: (tasks: Task[]) => void;
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

function insertAt(
  set: (fn: (s: TasksState) => Partial<TasksState>) => void,
  task: Task,
  index: number
) {
  set((s) => {
    const next = [...s.tasks];
    next.splice(Math.min(index, next.length), 0, task);
    return { tasks: next };
  });
}

export const useTasksStore = create<TasksState>()(
  persist(
    (set, get) => ({
      tasks: [],

      addTask: (draft) => {
        const task: Task = { ...fromDraft(draft), id: createId('task'), done: false };
        set((s) => ({ tasks: [...s.tasks, task] }));
        if (!DEMO_MODE) {
          const serverId = tasksApi.create(fromDraft(draft)).then((created) => created.id);
          trackNew(task.id, serverId);
          serverId.then(
            (real) =>
              set((s) => ({
                tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, id: real } : t)),
              })),
            (e: unknown) => {
              set((s) => ({ tasks: s.tasks.filter((t) => t.id !== task.id) }));
              reportFailure(e, 'Couldn’t save that task. Check your connection and try again.');
            }
          );
        }
        return task;
      },

      updateTask: (id, draft) => {
        const before = get().tasks.find((t) => t.id === id);
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...fromDraft(draft) } : t)),
        }));
        if (DEMO_MODE || !before) return;
        serial(id, async () => tasksApi.update(await resolveId(id), fromDraft(draft))).catch(
          (e: unknown) => {
            set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? before : t)) }));
            reportFailure(e, 'Couldn’t save your changes. Check your connection and try again.');
          }
        );
      },

      toggleTask: (id) => {
        let done = false;
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== id) return t;
            done = !t.done;
            return { ...t, done };
          }),
        }));
        if (!DEMO_MODE) {
          serial(id, async () => tasksApi.setDone(await resolveId(id), done)).catch(
            (e: unknown) => {
              set((s) => ({
                tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !done } : t)),
              }));
              reportFailure(e, 'Couldn’t update that task. Check your connection and try again.');
            }
          );
        }
        return done;
      },

      removeTask: (id) => {
        const { tasks } = get();
        const index = tasks.findIndex((t) => t.id === id);
        if (index < 0) return null;
        set({ tasks: tasks.filter((t) => t.id !== id) });
        if (!DEMO_MODE) {
          serial(id, async () => tasksApi.remove(await resolveId(id))).catch((e: unknown) => {
            insertAt(set, tasks[index], index);
            reportFailure(e, 'Couldn’t delete that task. Check your connection and try again.');
          });
        }
        return { task: tasks[index], index };
      },

      restoreTask: (task, index) => {
        insertAt(set, task, index);
        if (DEMO_MODE) return;
        serial(task.id, async () => tasksApi.restore(await resolveId(task.id))).catch(
          (e: unknown) => {
            set((s) => ({ tasks: s.tasks.filter((t) => t.id !== task.id) }));
            reportFailure(e, 'Couldn’t undo that. Check your connection and try again.');
          }
        );
      },

      replaceAll: (tasks) => set({ tasks }),

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
