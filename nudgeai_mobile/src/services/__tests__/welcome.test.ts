import { dateKey } from '@/lib/date';
import { useAuthStore } from '@/store/useAuthStore';
import { useHabitsStore } from '@/store/useHabitsStore';
import { usePreferencesStore } from '@/store/usePreferencesStore';
import { useTasksStore } from '@/store/useTasksStore';

import { speak } from '../speaker';
import { currentWelcome, welcomeAloud } from '../welcome';

jest.mock('../speaker', () => ({ speak: jest.fn(async () => ({ stop: jest.fn() })) }));

const NOW = new Date(2026, 9, 29, 9, 0);
const day = (offset: number) => dateKey(new Date(2026, 9, 29 + offset));
const habit = (id: string, completions: string[]) => ({
  id,
  name: id,
  emoji: '🎯',
  category: 'x',
  timeOfDay: 'Morning' as const,
  frequency: 'Daily' as const,
  goalDays: 7,
  completions,
});

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    status: 'ready',
    user: { id: 'u', name: 'Ada Lovelace', nickname: 'Ada', email: 'a@b.co' },
  });
  useHabitsStore.getState().clear();
  useTasksStore.getState().clear();
  usePreferencesStore.getState().reset();
});

describe('currentWelcome', () => {
  it('reflects the real streak and what is left today', () => {
    // done yesterday and the day before, not yet today; plus one habit never done
    useHabitsStore.getState().replaceAll([habit('read', [day(-1), day(-2)]), habit('walk', [])]);
    useTasksStore.getState().replaceAll([
      {
        id: 't1',
        title: 'Call',
        date: day(0),
        startTime: null,
        endTime: null,
        priority: 'High',
        done: false,
      },
      {
        id: 't2',
        title: 'Done',
        date: day(0),
        startTime: null,
        endTime: null,
        priority: 'Low',
        done: true,
      },
      {
        id: 't3',
        title: 'Tomorrow',
        date: day(1),
        startTime: null,
        endTime: null,
        priority: 'Low',
        done: false,
      },
    ]);
    const w = currentWelcome('returning', NOW);
    expect(w.headline).toBe('Good morning, Ada!');
    expect(w.spoken).toContain('2-day streak');
    expect(w.spoken).toContain('2 habits and 1 task'); // tomorrow's and finished tasks don't count
  });

  it('uses the name they asked to be called', () => {
    expect(currentWelcome('returning', NOW).headline).toContain('Ada');
    expect(currentWelcome('returning', NOW).headline).not.toContain('Lovelace');
  });
});

describe('welcomeAloud', () => {
  it('speaks the full welcome in the chosen tone and returns the short line', () => {
    usePreferencesStore.getState().set({ tone: 'firm' });
    const w = welcomeAloud('returning');
    expect(speak).toHaveBeenCalledTimes(1);
    const [text, options] = jest.mocked(speak).mock.calls[0];
    expect(text).toBe(w.spoken);
    expect(options).toMatchObject({ tone: 'firm' });
    expect(w.headline).toMatch(/^Good (morning|afternoon|evening), Ada!$/);
  });

  it('stays silent, but still returns the line, when voice is switched off', () => {
    usePreferencesStore.getState().setNotification('voice', false);
    const w = welcomeAloud('returning');
    expect(speak).not.toHaveBeenCalled();
    expect(w.headline).toContain('Ada');
  });

  it('welcomes a new account differently from a returning one', () => {
    welcomeAloud('new');
    expect(jest.mocked(speak).mock.calls[0][0]).toContain('Welcome to Nudge, Ada!');
  });
});
