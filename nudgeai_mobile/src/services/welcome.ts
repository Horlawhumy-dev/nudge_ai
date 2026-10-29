import { buildWelcome, type Welcome } from '@/features/home/welcome';
import { overallStreak } from '@/features/habits/streak';
import { isDoneToday } from '@/features/habits/utils';
import { doneCount, isForToday } from '@/features/tasks/utils';
import { displayName, useAuthStore } from '@/store/useAuthStore';
import { useHabitsStore } from '@/store/useHabitsStore';
import { usePreferencesStore } from '@/store/usePreferencesStore';
import { useTasksStore } from '@/store/useTasksStore';

import { speak } from './speaker';

/** The welcome for whoever is signed in right now, built from what the app already knows. */
export function currentWelcome(kind: 'new' | 'returning', now: Date = new Date()): Welcome {
  const habits = useHabitsStore.getState().habits;
  const today = useTasksStore.getState().tasks.filter((t) => isForToday(t, now));
  return buildWelcome({
    name: displayName(useAuthStore.getState().user),
    now,
    kind,
    habitsLeft: habits.filter((h) => !isDoneToday(h, now)).length,
    tasksLeft: today.length - doneCount(today),
    habitsTotal: habits.length,
    streak: overallStreak(habits, now),
  });
}

/**
 * Welcome the person aloud (unless they turned voice off) and return the short on-screen line.
 * Fire and forget: it keeps speaking while the app moves on to the next screen.
 */
export function welcomeAloud(kind: 'new' | 'returning'): Welcome {
  const welcome = currentWelcome(kind);
  const { notifications, tone } = usePreferencesStore.getState();
  if (notifications.voice) void speak(welcome.spoken, { tone });
  return welcome;
}
