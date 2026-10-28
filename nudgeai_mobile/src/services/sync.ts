import { habitFromApi, habitsApi } from '@/services/api/endpoints/habits';
import { taskFromApi, tasksApi } from '@/services/api/endpoints/tasks';
import { useHabitsStore } from '@/store/useHabitsStore';
import { useTasksStore } from '@/store/useTasksStore';

/** Pull the signed-in account's habits (with check-in history) and tasks into the local stores. */
export async function syncData(): Promise<void> {
  const [habits, days, tasks] = await Promise.all([
    habitsApi.list(),
    habitsApi.completions(),
    tasksApi.list(),
  ]);
  useHabitsStore.getState().replaceAll(habits.map((h) => habitFromApi(h, days[h.id] ?? [])));
  useTasksStore.getState().replaceAll(tasks.map(taskFromApi));
}
