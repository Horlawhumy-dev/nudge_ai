import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { PlannedReminder } from '@/features/reminders/plan';

const CHANNEL_ID = 'habit-reminders';
const supported = Platform.OS !== 'web';

/** Show reminders as banners while the app is open too. Call once at startup. */
export function configureNotifications(): void {
  if (!supported) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Habit reminders',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

export async function hasReminderPermission(): Promise<boolean> {
  if (!supported) return false;
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Asks the OS for permission (Android needs the channel to exist first). */
export async function requestReminderPermission(): Promise<boolean> {
  if (!supported) return false;
  try {
    await ensureChannel();
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function cancelReminders(): Promise<void> {
  if (!supported) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // nothing scheduled, or the native module is unavailable
  }
}

/** Replaces every scheduled reminder with `plan` (daily repeats). */
export async function scheduleReminders(plan: readonly PlannedReminder[]): Promise<void> {
  if (!supported) return;
  try {
    await ensureChannel();
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Promise.all(
      plan.map((r) =>
        Notifications.scheduleNotificationAsync({
          identifier: `habit-${r.habitId}`,
          content: { title: r.title, body: r.body, data: { habitId: r.habitId } },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: r.time.hour,
            minute: r.time.minute,
            channelId: CHANNEL_ID,
          },
        })
      )
    );
  } catch {
    // scheduling is best-effort; the in-app experience doesn't depend on it
  }
}
