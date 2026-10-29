import { buildSeedHabits } from '@/features/habits/data';

import { isQuiet, planReminders, reminderCopy, reminderTime, type ReminderPrefs } from '../plan';

const quiet = {
  enabled: true,
  from: '10:00 PM',
  to: '7:00 AM',
  days: [],
  allowHighPriority: true,
  weekends: false,
};
const prefs: ReminderPrefs = {
  name: 'Champion',
  tone: 'gentle',
  includeStreak: true,
  useEmojis: false,
  wakeTime: '7-8',
  sleepTime: '1030-12',
  quietHours: quiet,
};

describe('reminder planning', () => {
  it('anchors morning and evening reminders to wake and sleep windows', () => {
    expect(reminderTime('Morning', '7-8', 'x')).toEqual({ hour: 8, minute: 30 });
    expect(reminderTime('Morning', 'before-6', 'x')).toEqual({ hour: 6, minute: 30 });
    expect(reminderTime('Afternoon', 'x', 'x')).toEqual({ hour: 14, minute: 0 });
    expect(reminderTime('Evening', 'x', 'before-9')).toEqual({ hour: 18, minute: 0 });
    expect(reminderTime('Morning', 'unknown', 'x')).toEqual({ hour: 8, minute: 30 });
  });

  it('detects overnight quiet hours', () => {
    expect(isQuiet({ hour: 23, minute: 0 }, quiet)).toBe(true);
    expect(isQuiet({ hour: 6, minute: 30 }, quiet)).toBe(true);
    expect(isQuiet({ hour: 8, minute: 30 }, quiet)).toBe(false);
    expect(isQuiet({ hour: 23, minute: 0 }, { ...quiet, enabled: false })).toBe(false);
  });

  it('skips reminders that land inside quiet hours', () => {
    const early = planReminders(buildSeedHabits(), { ...prefs, wakeTime: 'before-6' });
    // 6:30 am morning reminder falls before 7:00 am quiet end
    expect(early.find((r) => r.habitId === 'habit_workout')).toBeUndefined();
    const normal = planReminders(buildSeedHabits(), prefs);
    expect(normal).toHaveLength(4);
  });

  it('writes tone-matched copy', () => {
    const habit = { id: 'h1', name: 'Morning Workout', emoji: '💪' };
    expect(reminderCopy(habit, prefs).body).toBe(
      'Hey Champion, ready for Morning Workout when you are.'
    );
    expect(reminderCopy(habit, { ...prefs, tone: 'firm' }).body).toBe(
      'Champion. Morning Workout. Now. Let’s go.'
    );
    expect(reminderCopy(habit, prefs, 7).body).toMatch(/7-day streak/);
    expect(reminderCopy(habit, prefs, 1).body).not.toMatch(/streak/);
    expect(reminderCopy(habit, { ...prefs, useEmojis: true }).title).toBe('💪 Morning Workout');
    expect(reminderCopy(habit, { ...prefs, name: '' }).body).toBe(
      'Hey, ready for Morning Workout when you are.'
    );
  });
});
