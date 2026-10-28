import type { Task, TaskPriority } from '@/features/tasks/types';
import { dateKey } from '@/lib/date';

import { api } from '../client';
import type { ApiTask } from '../types';

type TaskFields = Omit<Task, 'id' | 'done'>;

export function taskFromApi(t: ApiTask): Task {
  return {
    id: t.id,
    title: t.title,
    date: t.date ?? dateKey(),
    startTime: t.start_time,
    endTime: t.end_time,
    priority: (t.priority.charAt(0).toUpperCase() + t.priority.slice(1)) as TaskPriority,
    done: t.done,
    notes: t.notes ?? undefined,
    repeat: t.repeat || undefined,
  };
}

export function taskToApi(t: TaskFields) {
  return {
    title: t.title,
    notes: t.notes ?? null,
    priority: t.priority.toLowerCase(),
    date: t.date,
    start_time: t.startTime,
    end_time: t.endTime,
    repeat: Boolean(t.repeat),
  };
}

export const tasksApi = {
  /** Every task, including completed ones, so the Completed tab has something to show. */
  async list() {
    const { data } = await api.get<ApiTask[]>('/tasks', { params: { status: 'all' } });
    return data;
  },

  async create(t: TaskFields) {
    const { data } = await api.post<ApiTask>('/tasks', taskToApi(t));
    return data;
  },

  async update(id: string, t: TaskFields) {
    const { data } = await api.patch<ApiTask>(`/tasks/${id}`, taskToApi(t));
    return data;
  },

  async setDone(id: string, done: boolean) {
    await api.post(`/tasks/${id}/${done ? 'complete' : 'uncomplete'}`);
  },

  async remove(id: string) {
    await api.delete(`/tasks/${id}`);
  },

  async restore(id: string) {
    await api.post(`/tasks/${id}/restore`);
  },
};
