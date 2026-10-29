import type { NudgeNotification } from './types';

const HOUR = 3_600_000;

/** Demo inbox relative to `now`: three unread (matches the bell badge) and some history. */
export function buildSeedNotifications(now: number = Date.now()): NudgeNotification[] {
  return [
    {
      id: 'n1',
      kind: 'nudge',
      title: 'Deep work in 10 mins',
      body: 'Hey Champion, your deep work session starts soon. You’re on a 7-day streak, keep it going!',
      createdAt: now - 0.2 * HOUR,
      read: false,
      href: '/tasks',
    },
    {
      id: 'n2',
      kind: 'summary',
      title: 'Your morning summary',
      body: 'You have 4 habits and 5 tasks today. Two habits are already done.',
      createdAt: now - 2 * HOUR,
      read: false,
      href: '/home',
    },
    {
      id: 'n3',
      kind: 'streak',
      title: 'Streak at risk',
      body: 'Drink Water is still open today. A quick check-in keeps your streak alive.',
      createdAt: now - 5 * HOUR,
      read: false,
      href: '/streak',
    },
    {
      id: 'n4',
      kind: 'insight',
      title: 'New insight',
      body: 'You complete most tasks before noon. Try scheduling your important work in the morning.',
      createdAt: now - 26 * HOUR,
      read: true,
      href: '/report',
    },
    {
      id: 'n5',
      kind: 'system',
      title: 'Welcome to Nudge',
      body: 'Ask Nudge AI to reschedule a task, summarise your day, or suggest new habits.',
      createdAt: now - 72 * HOUR,
      read: true,
      href: '/chat',
    },
  ];
}
