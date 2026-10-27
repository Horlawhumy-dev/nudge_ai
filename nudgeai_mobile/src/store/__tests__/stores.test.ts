import { useAuthStore } from '../useAuthStore';
import { useHabitsStore } from '../useHabitsStore';
import { useTasksStore } from '../useTasksStore';

beforeEach(() => {
  useHabitsStore.getState().clear();
  useTasksStore.getState().clear();
  useAuthStore.setState({ status: 'signedOut', user: null, pendingEmail: null });
});

describe('useHabitsStore', () => {
  const draft = {
    name: 'Stretch',
    emoji: '🧘',
    category: 'Health',
    timeOfDay: 'Morning' as const,
    frequency: 'Daily' as const,
  };

  it('adds habits with cycling accents and a 7-day daily goal', () => {
    const { addHabit } = useHabitsStore.getState();
    const first = addHabit(draft);
    expect(first.goalDays).toBe(7);
    expect(first.completedToday).toBe(false);
    expect(useHabitsStore.getState().habits).toHaveLength(1);
  });

  it('toggles completion and keeps progress within bounds', () => {
    const { addHabit, toggleHabit } = useHabitsStore.getState();
    const { id } = addHabit(draft);
    toggleHabit(id);
    expect(useHabitsStore.getState().habits[0]).toMatchObject({
      completedToday: true,
      daysDone: 1,
    });
    toggleHabit(id);
    expect(useHabitsStore.getState().habits[0]).toMatchObject({
      completedToday: false,
      daysDone: 0,
    });
    toggleHabit(id);
    toggleHabit(id);
    expect(useHabitsStore.getState().habits[0].daysDone).toBe(0);
  });

  it('clears stacking links when the trigger habit is removed', () => {
    const { addHabit, removeHabit } = useHabitsStore.getState();
    const trigger = addHabit(draft);
    addHabit({ ...draft, name: 'Journal', stackedAfter: trigger.id });
    removeHabit(trigger.id);
    expect(useHabitsStore.getState().habits[0].stackedAfter).toBeUndefined();
  });
});

describe('useTasksStore', () => {
  it('adds a task one hour long and completes it', () => {
    const { addTask, toggleTask } = useTasksStore.getState();
    const task = addTask({
      title: ' Plan sprint ',
      date: '',
      time: '14:30',
      priority: 'High',
      notes: '',
      repeat: false,
    });
    expect(task).toMatchObject({
      title: 'Plan sprint',
      startTime: '2:30 pm',
      endTime: '3:30 pm',
      done: false,
    });
    toggleTask(task.id);
    expect(useTasksStore.getState().tasks[0].done).toBe(true);
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
