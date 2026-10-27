import { isDoneToday } from '@/features/habits/utils';
import { dateKey } from '@/lib/date';

import { useAuthStore } from '../useAuthStore';
import { useHabitsStore } from '../useHabitsStore';
import { useTasksStore } from '../useTasksStore';
import { useToastStore, toast } from '../useToastStore';

beforeEach(() => {
  useHabitsStore.getState().clear();
  useTasksStore.getState().clear();
  useAuthStore.setState({ status: 'signedOut', user: null, pendingEmail: null });
  useToastStore.setState({ current: null });
});

describe('useHabitsStore', () => {
  const draft = {
    name: 'Stretch',
    emoji: '🧘',
    category: 'Health',
    timeOfDay: 'Morning' as const,
    frequency: 'Daily' as const,
  };

  it('adds habits with a goal from their frequency and no completions', () => {
    const { addHabit } = useHabitsStore.getState();
    const daily = addHabit(draft);
    const weekdays = addHabit({ ...draft, name: 'Gym', frequency: 'Weekdays' });
    expect(daily).toMatchObject({ goalDays: 7, completions: [] });
    expect(weekdays.goalDays).toBe(5);
    expect(useHabitsStore.getState().habits).toHaveLength(2);
  });

  it('ticks and unticks today by calendar day', () => {
    const { addHabit, toggleHabit } = useHabitsStore.getState();
    const { id } = addHabit(draft);
    expect(toggleHabit(id)).toBe(true);
    expect(isDoneToday(useHabitsStore.getState().habits[0])).toBe(true);
    expect(toggleHabit(id)).toBe(false);
    expect(useHabitsStore.getState().habits[0].completions).toHaveLength(0);
  });

  it('keeps a tick for one day separate from the next', () => {
    const { addHabit, toggleHabit } = useHabitsStore.getState();
    const { id } = addHabit(draft);
    const yesterday = new Date(Date.now() - 86_400_000);
    toggleHabit(id, yesterday);
    expect(useHabitsStore.getState().habits[0].completions).toEqual([dateKey(yesterday)]);
    expect(isDoneToday(useHabitsStore.getState().habits[0])).toBe(false);
  });

  it('updates a habit and re-derives its goal from the new frequency', () => {
    const { addHabit, updateHabit } = useHabitsStore.getState();
    const { id } = addHabit(draft);
    updateHabit(id, { name: 'Stretch daily', frequency: 'Weekly' });
    expect(useHabitsStore.getState().habits[0]).toMatchObject({
      name: 'Stretch daily',
      goalDays: 1,
    });
  });

  it('removes a habit, unlinks stacked habits, and restores it in place', () => {
    const { addHabit, removeHabit, restoreHabit } = useHabitsStore.getState();
    const trigger = addHabit(draft);
    addHabit({ ...draft, name: 'Journal', stackedAfter: trigger.id });
    const removed = removeHabit(trigger.id);
    expect(removed?.index).toBe(0);
    expect(useHabitsStore.getState().habits[0].stackedAfter).toBeUndefined();
    restoreHabit(removed!.habit, removed!.index);
    expect(useHabitsStore.getState().habits.map((h) => h.name)).toEqual(['Stretch', 'Journal']);
    expect(removeHabit('missing')).toBeNull();
  });
});

describe('useTasksStore', () => {
  const draft = {
    title: ' Plan sprint ',
    date: dateKey(),
    time: '14:30',
    priority: 'High' as const,
    notes: '',
    repeat: false,
  };

  it('adds a one-hour task and completes it', () => {
    const { addTask, toggleTask } = useTasksStore.getState();
    const task = addTask(draft);
    expect(task).toMatchObject({
      title: 'Plan sprint',
      startTime: '14:30',
      endTime: '15:30',
      done: false,
    });
    expect(toggleTask(task.id)).toBe(true);
    expect(useTasksStore.getState().tasks[0].done).toBe(true);
  });

  it('supports all-day tasks', () => {
    const task = useTasksStore.getState().addTask({ ...draft, time: null });
    expect(task).toMatchObject({ startTime: null, endTime: null });
  });

  it('edits, deletes and restores', () => {
    const { addTask, updateTask, removeTask, restoreTask } = useTasksStore.getState();
    const a = addTask(draft);
    addTask({ ...draft, title: 'Second' });
    updateTask(a.id, { ...draft, title: 'Plan the sprint', time: '10:00' });
    expect(useTasksStore.getState().tasks[0]).toMatchObject({
      title: 'Plan the sprint',
      startTime: '10:00',
      endTime: '11:00',
    });
    const removed = removeTask(a.id);
    expect(useTasksStore.getState().tasks).toHaveLength(1);
    restoreTask(removed!.task, removed!.index);
    expect(useTasksStore.getState().tasks[0].id).toBe(a.id);
  });
});

describe('useToastStore', () => {
  it('shows one toast at a time and dismisses by id', () => {
    const first = toast.show('One');
    const second = toast.success('Two');
    expect(useToastStore.getState().current).toMatchObject({ id: second, tone: 'success' });
    useToastStore.getState().dismiss(first); // stale id: ignored
    expect(useToastStore.getState().current?.id).toBe(second);
    useToastStore.getState().dismiss(second);
    expect(useToastStore.getState().current).toBeNull();
  });
});

describe('useAuthStore session funnel', () => {
  it('walks signUp → verify → onboarding → ready with empty data', async () => {
    const auth = useAuthStore.getState();
    await auth.signUp('Rophy Alade', 'r@nudge.ai', 'Password1!');
    expect(useAuthStore.getState().status).toBe('unverified');
    await useAuthStore.getState().verifyEmail('1648');
    expect(useAuthStore.getState().status).toBe('onboarding');
    useAuthStore.getState().completeOnboarding('Rophy');
    expect(useAuthStore.getState()).toMatchObject({ status: 'ready' });
    expect(useAuthStore.getState().user?.nickname).toBe('Rophy');
    expect(useHabitsStore.getState().habits).toHaveLength(0);
  });

  it('signs in to the seeded demo data and signs out', async () => {
    await useAuthStore.getState().signIn('demo@nudge.ai', 'x');
    expect(useAuthStore.getState().status).toBe('ready');
    expect(useHabitsStore.getState().habits).toHaveLength(4);
    expect(useTasksStore.getState().tasks).toHaveLength(5);
    useAuthStore.getState().signOut();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', user: null });
  });
});
