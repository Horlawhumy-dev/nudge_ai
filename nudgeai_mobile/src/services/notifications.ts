import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import type * as NotificationsModule from 'expo-notifications';

import type { PlannedReminder } from '@/features/reminders/plan';

type NotificationsApi = typeof NotificationsModule;

const CHANNEL_ID = 'habit-reminders';

/**
 * Whether this runtime can schedule reminders. Not on web, and not in Expo Go on Android,
 * where expo-notifications throws (remote push was removed from Expo Go in SDK 53). A
 * development build supports everything.
 */
export function remindersAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android' && isRunningInExpoGo()) return false;
  return true;
}

let cached: NotificationsApi | null | undefined;

/** Loads expo-notifications on first use so merely importing this file never throws. */
function load(): NotificationsApi | null {
  if (cached !== undefined) return cached;
  if (!remindersAvailable()) return (cached = null);
  try {
    // Deliberately lazy: a static import throws at startup in Android Expo Go.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as NotificationsApi;
  } catch {
    cached = null;
  }
  return cached;
}

/** Show reminders as banners while the app is open too. Call once at startup. */
export function configureNotifications(): void {
  const N = load();
  if (!N) return;
  try {
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // unsupported runtime; reminders stay off
  }
}

async function ensureChannel(N: NotificationsApi): Promise<void> {
  if (Platform.OS !== 'android') return;
  await N.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Habit reminders',
    importance: N.AndroidImportance.HIGH,
  });
}

export async function hasReminderPermission(): Promise<boolean> {
  const N = load();
  if (!N) return false;
  try {
    return (await N.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Asks the OS for permission (Android needs the channel to exist first). */
export async function requestReminderPermission(): Promise<boolean> {
  const N = load();
  if (!N) return false;
  try {
    await ensureChannel(N);
    return (await N.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function cancelReminders(): Promise<void> {
  const N = load();
  if (!N) return;
  try {
    await N.cancelAllScheduledNotificationsAsync();
  } catch {
    // nothing scheduled, or the native module is unavailable
  }
}

/** Replaces every scheduled reminder with `plan` (daily repeats). */
export async function scheduleReminders(plan: readonly PlannedReminder[]): Promise<void> {
  const N = load();
  if (!N) return;
  try {
    await ensureChannel(N);
    await N.cancelAllScheduledNotificationsAsync();
    await Promise.all(
      plan.map((r) =>
        N.scheduleNotificationAsync({
          identifier: `habit-${r.habitId}`,
          content: { title: r.title, body: r.body, data: { habitId: r.habitId } },
          trigger: {
            type: N.SchedulableTriggerInputTypes.DAILY,
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
