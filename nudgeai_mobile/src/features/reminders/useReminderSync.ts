import { useEffect } from 'react';

import { habitStreak } from '@/features/habits/utils';
import {
  cancelReminders,
  hasReminderPermission,
  scheduleReminders,
} from '@/services/notifications';
import { displayName, useAuthStore } from '@/store/useAuthStore';
import { useHabitsStore } from '@/store/useHabitsStore';
import { usePreferencesStore } from '@/store/usePreferencesStore';

import { planReminders } from './plan';

/**
 * Keeps scheduled OS reminders in step with the user's habits and preferences. Mount once
 * inside the signed-in area. Does nothing until notification permission has been granted.
 */
export function useReminderSync(): void {
  const habits = useHabitsStore((s) => s.habits);
  const name = useAuthStore((s) => displayName(s.user));
  const prefs = usePreferencesStore();

  const pushEnabled = prefs.notifications.push;
  const { tone, includeStreak, useEmojis, wakeTime, sleepTime, quietHours } = prefs;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!pushEnabled || !(await hasReminderPermission())) {
        await cancelReminders();
        return;
      }
      if (cancelled) return;
      const plan = planReminders(
        habits,
        { name, tone, includeStreak, useEmojis, wakeTime, sleepTime, quietHours },
        (h) => habitStreak(h)
      );
      await scheduleReminders(plan);
    })();
    return () => {
      cancelled = true;
    };
  }, [habits, name, pushEnabled, tone, includeStreak, useEmojis, wakeTime, sleepTime, quietHours]);
}
