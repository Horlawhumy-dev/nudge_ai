import { ApiError } from '@/services/api/errors';
import { habitsApi } from '@/services/api/endpoints/habits';
import { tasksApi } from '@/services/api/endpoints/tasks';

import { useHabitsStore } from '../useHabitsStore';
import { useTasksStore } from '../useTasksStore';
import { useToastStore } from '../useToastStore';

jest.mock('@/constants/env', () => ({
  API_URL: 'http://api.test/v1',
  DEMO_MODE: false,
  DEMO_EMAIL: 'demo@nudge.ai',
  DEMO_PASSWORD: 'Password1!',
  DEMO_CODE: '1234',
}));
jest.mock('@/services/api/endpoints/habits', () => ({
  ...jest.requireActual('@/services/api/endpoints/habits'),
  habitsApi: {
    list: jest.fn(),
    completions: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    restore: jest.fn(),
    check: jest.fn(),
  },
}));
jest.mock('@/services/api/endpoints/tasks', () => ({
  ...jest.requireActual('@/services/api/endpoints/tasks'),
  tasksApi: {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setDone: jest.fn(),
    remove: jest.fn(),
    restore: jest.fn(),
  },
}));

const habits = jest.mocked(habitsApi);
const tasks = jest.mocked(tasksApi);
const flush = () => new Promise((r) => setTimeout(r, 0));

const draft = {
  name: 'Read',
  emoji: '📚',
  category: 'Learning',
  timeOfDay: 'Evening' as const,
  frequency: 'Daily' as const,
};
const apiHabit = (id: string) => ({
  id,
  name: 'Read',
  emoji: '📚',
  category: 'Learning',
  time_of_day: 'evening',
  frequency: 'daily',
  goal_days: 7,
  stacked_after_id: null,
  active: true,
  done_today: false,
  done_last_7d: 0,
  streak: null,
});

beforeEach(() => {
  jest.resetAllMocks();
  useHabitsStore.getState().clear();
  useTasksStore.getState().clear();
  useToastStore.setState({ current: null });
});

describe('habits against a backend', () => {
  it('shows a new habit at once, then swaps in the server id', async () => {
    habits.create.mockResolvedValue(apiHabit('srv-1'));
    const h = useHabitsStore.getState().addHabit(draft);
    expect(useHabitsStore.getState().habits[0].id).toBe(h.id); // instant, before the server replies
    await flush();
    expect(useHabitsStore.getState().habits.map((x) => x.id)).toEqual(['srv-1']);
    expect(habits.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Read' }));
  });

  it('removes the habit and says why when the server refuses (plan limit)', async () => {
    habits.create.mockRejectedValue(
      new ApiError('Free includes 3 habits. Upgrade to add more.', 402)
    );
    useHabitsStore.getState().addHabit(draft);
    await flush();
    expect(useHabitsStore.getState().habits).toEqual([]);
    expect(useToastStore.getState().current).toMatchObject({
      message: 'Free includes 3 habits. Upgrade to add more.',
      tone: 'error',
    });
  });

  it('waits for the server id before checking a just-created habit in', async () => {
    let resolveCreate: (h: ReturnType<typeof apiHabit>) => void = () => undefined;
    habits.create.mockReturnValue(new Promise((r) => (resolveCreate = r)));
    habits.check.mockResolvedValue(undefined);
    const h = useHabitsStore.getState().addHabit(draft);
    useHabitsStore.getState().toggleHabit(h.id, new Date(2026, 0, 5));
    await flush();
    expect(habits.check).not.toHaveBeenCalled();
    resolveCreate(apiHabit('srv-9'));
    await flush();
    expect(habits.check).toHaveBeenCalledWith('srv-9', '2026-01-05', true);
  });

  it('sends rapid ticks in order and rolls a failed one back', async () => {
    useHabitsStore.getState().replaceAll([
      {
        id: 'h1',
        name: 'Read',
        emoji: '📚',
        category: 'x',
        timeOfDay: 'Evening',
        frequency: 'Daily',
        goalDays: 7,
        completions: [],
      },
    ]);
    const order: boolean[] = [];
    habits.check.mockImplementation(async (_id, _on, done) => {
      order.push(done);
      if (order.length === 3) throw new ApiError('boom', 500);
    });
    const day = new Date(2026, 0, 5);
    useHabitsStore.getState().toggleHabit('h1', day);
    useHabitsStore.getState().toggleHabit('h1', day);
    useHabitsStore.getState().toggleHabit('h1', day);
    await flush();
    expect(order).toEqual([true, false, true]);
    // the last tick failed, so the habit is back to unticked
    expect(useHabitsStore.getState().habits[0].completions).toEqual([]);
  });

  it('puts a habit back if the delete fails, and undo restores it on the server', async () => {
    useHabitsStore.getState().replaceAll([
      {
        id: 'h1',
        name: 'Read',
        emoji: '📚',
        category: 'x',
        timeOfDay: 'Evening',
        frequency: 'Daily',
        goalDays: 7,
        completions: [],
      },
    ]);
    habits.remove.mockRejectedValue(new ApiError('nope', 500));
    useHabitsStore.getState().removeHabit('h1');
    await flush();
    expect(useHabitsStore.getState().habits).toHaveLength(1);

    habits.remove.mockResolvedValue(undefined);
    habits.restore.mockResolvedValue(undefined);
    const removed = useHabitsStore.getState().removeHabit('h1');
    useHabitsStore.getState().restoreHabit(removed!.habit, removed!.index);
    await flush();
    expect(habits.restore).toHaveBeenCalledWith('h1');
    expect(useHabitsStore.getState().habits).toHaveLength(1);
  });

  it('turns server habits into screen habits with stable colours', () => {
    useHabitsStore.getState().replaceAll([
      {
        id: 'a',
        name: 'A',
        emoji: '1',
        category: 'x',
        timeOfDay: 'Morning',
        frequency: 'Daily',
        goalDays: 7,
        completions: ['2026-01-01'],
      },
      {
        id: 'b',
        name: 'B',
        emoji: '2',
        category: 'x',
        timeOfDay: 'Morning',
        frequency: 'Daily',
        goalDays: 7,
        completions: [],
      },
    ]);
    const [a, b] = useHabitsStore.getState().habits;
    expect([a.accentIndex, b.accentIndex]).toEqual([0, 1]);
  });
});

describe('tasks against a backend', () => {
  const taskDraft = {
    title: 'Call dentist',
    date: '2026-01-05',
    time: '14:30',
    priority: 'High' as const,
    notes: '',
    repeat: false,
  };

  it('creates with the server and keeps the screen in step', async () => {
    tasks.create.mockResolvedValue({
      id: 't-1',
      title: 'Call dentist',
      notes: null,
      priority: 'high',
      date: '2026-01-05',
      start_time: '14:30',
      end_time: '15:30',
      all_day: false,
      repeat: false,
      repeat_rule: null,
      done: false,
      status: 'upcoming',
    });
    const t = useTasksStore.getState().addTask(taskDraft);
    expect(useTasksStore.getState().tasks[0].id).toBe(t.id);
    await flush();
    expect(useTasksStore.getState().tasks[0].id).toBe('t-1');
    expect(tasks.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Call dentist', startTime: '14:30', endTime: '15:30' })
    );
  });

  it('reverts a completion the server rejected', async () => {
    useTasksStore.getState().replaceAll([
      {
        id: 't1',
        title: 'x',
        date: '2026-01-05',
        startTime: null,
        endTime: null,
        priority: 'Low',
        done: false,
      },
    ]);
    tasks.setDone.mockRejectedValue(new ApiError('offline', 0));
    useTasksStore.getState().toggleTask('t1');
    expect(useTasksStore.getState().tasks[0].done).toBe(true);
    await flush();
    expect(useTasksStore.getState().tasks[0].done).toBe(false);
    expect(useToastStore.getState().current?.tone).toBe('error');
  });

  it('restores the old task if an edit fails', async () => {
    useTasksStore.getState().replaceAll([
      {
        id: 't1',
        title: 'Old',
        date: '2026-01-05',
        startTime: null,
        endTime: null,
        priority: 'Low',
        done: false,
      },
    ]);
    tasks.update.mockRejectedValue(new ApiError('bad', 422));
    useTasksStore.getState().updateTask('t1', { ...taskDraft, title: 'New' });
    expect(useTasksStore.getState().tasks[0].title).toBe('New');
    await flush();
    expect(useTasksStore.getState().tasks[0].title).toBe('Old');
  });
});
