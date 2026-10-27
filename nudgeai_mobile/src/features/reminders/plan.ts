import type { ToneId } from '@/features/onboarding/data';
import type { Habit, TimeOfDay } from '@/features/habits/types';
import { parseClock } from '@/features/settings/utils';
import type { QuietHours } from '@/store/usePreferencesStore';

export type ReminderTime = { hour: number; minute: number };

export type ReminderPrefs = {
  name: string;
  tone: ToneId;
  includeStreak: boolean;
  useEmojis: boolean;
  wakeTime: string;
  sleepTime: string;
  quietHours: QuietHours;
};

export type PlannedReminder = {
  habitId: string;
  time: ReminderTime;
  title: string;
  body: string;
};

/** Morning reminders follow the wake-up window chosen in setup (+ half an hour of grace). */
const MORNING_BY_WAKE: Record<string, ReminderTime> = {
  'before-6': { hour: 6, minute: 30 },
  '6-7': { hour: 7, minute: 30 },
  '7-8': { hour: 8, minute: 30 },
  'after-8': { hour: 9, minute: 30 },
};

/** Evening reminders land comfortably before the sleep window. */
const EVENING_BY_SLEEP: Record<string, ReminderTime> = {
  'before-9': { hour: 18, minute: 0 },
  '9-1030': { hour: 19, minute: 0 },
  '1030-12': { hour: 20, minute: 0 },
  'after-midnight': { hour: 21, minute: 0 },
};

export function reminderTime(
  timeOfDay: TimeOfDay,
  wakeTime: string,
  sleepTime: string
): ReminderTime {
  if (timeOfDay === 'Morning') return MORNING_BY_WAKE[wakeTime] ?? { hour: 8, minute: 30 };
  if (timeOfDay === 'Afternoon') return { hour: 14, minute: 0 };
  return EVENING_BY_SLEEP[sleepTime] ?? { hour: 19, minute: 0 };
}

/** True when `time` falls inside the (possibly overnight) quiet window. */
export function isQuiet(time: ReminderTime, quiet: QuietHours): boolean {
  if (!quiet.enabled) return false;
  const from = parseClock(quiet.from);
  const to = parseClock(quiet.to);
  if (Number.isNaN(from) || Number.isNaN(to) || from === to) return false;
  const t = time.hour * 60 + time.minute;
  return from < to ? t >= from && t < to : t >= from || t < to;
}

/** Tone-matched copy. "Mix it up" alternates by habit so a day feels varied but stable. */
export function reminderCopy(
  habit: Pick<Habit, 'id' | 'name' | 'emoji'>,
  prefs: Pick<ReminderPrefs, 'name' | 'tone' | 'includeStreak' | 'useEmojis'>,
  streak = 0
): { title: string; body: string } {
  const who = prefs.name.trim();
  const tone: Exclude<ToneId, 'mix'> =
    prefs.tone === 'mix' ? (habit.id.length % 2 === 0 ? 'gentle' : 'firm') : prefs.tone;
  const emoji = prefs.useEmojis ? `${habit.emoji} ` : '';

  const title = `${emoji}${habit.name}`;
  let body =
    tone === 'gentle'
      ? `${who ? `Hey ${who}, ` : 'Hey, '}ready for ${habit.name} when you are.`
      : `${who ? `${who}. ` : ''}${habit.name}. Now. Let’s go.`;
  if (prefs.includeStreak && streak > 1) body += ` You’re on a ${streak}-day streak.`;
  return { title, body };
}

/** One daily reminder per habit, skipping any that would land in quiet hours. */
export function planReminders(
  habits: readonly Habit[],
  prefs: ReminderPrefs,
  streakOf: (habit: Habit) => number = () => 0
): PlannedReminder[] {
  return habits.flatMap((habit) => {
    const time = reminderTime(habit.timeOfDay, prefs.wakeTime, prefs.sleepTime);
    if (isQuiet(time, prefs.quietHours)) return [];
    return [{ habitId: habit.id, time, ...reminderCopy(habit, prefs, streakOf(habit)) }];
  });
}
