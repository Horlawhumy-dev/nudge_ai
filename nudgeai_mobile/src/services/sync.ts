import { DEMO_MODE } from '@/constants/env';
import { SLEEP_TIMES, WAKE_TIMES } from '@/features/onboarding/data';
import { habitFromApi, habitsApi } from '@/services/api/endpoints/habits';
import {
  preferencesApi,
  preferencesFromApi,
  preferencesToApi,
  sleepIdFromTime,
  wakeIdFromTime,
} from '@/services/api/endpoints/preferences';
import { profileApi } from '@/services/api/endpoints/profile';
import { taskFromApi, tasksApi } from '@/services/api/endpoints/tasks';
import { reportFailure } from '@/store/remote';
import { useChatStore } from '@/store/useChatStore';
import { useHabitsStore } from '@/store/useHabitsStore';
import { useNotificationsStore } from '@/store/useNotificationsStore';
import { usePreferencesStore } from '@/store/usePreferencesStore';
import { useTasksStore } from '@/store/useTasksStore';

/** True while server values are being written into the store, so they are not sent straight back. */
let applyingRemote = false;

/** Pull settings, wake/sleep times and goals from the server into the preferences store. */
async function pullPreferences(): Promise<void> {
  const [prefs, onboarding] = await Promise.all([preferencesApi.get(), profileApi.getOnboarding()]);
  const store = usePreferencesStore.getState();
  applyingRemote = true;
  try {
    store.set({
      ...preferencesFromApi(prefs, store),
      wakeTime: wakeIdFromTime(onboarding.wake_time),
      sleepTime: sleepIdFromTime(onboarding.sleep_time),
      goals: onboarding.goals,
    });
  } finally {
    applyingRemote = false;
  }
}

/** Pull just the habits (with check-in history) and tasks, e.g. after the assistant changed them. */
export async function syncPlanner(): Promise<void> {
  const [habits, days, tasks] = await Promise.all([
    habitsApi.list(),
    habitsApi.completions(),
    tasksApi.list(),
  ]);
  useHabitsStore.getState().replaceAll(habits.map((h) => habitFromApi(h, days[h.id] ?? [])));
  useTasksStore.getState().replaceAll(tasks.map(taskFromApi));
}

/** Pull the signed-in account's habits, tasks, settings and chat history. */
export async function syncData(): Promise<void> {
  await syncPlanner();
  // Settings and chat history are nice to have; habits and tasks are not.
  await Promise.all([
    pullPreferences().catch(() => undefined),
    useChatStore
      .getState()
      .loadHistory()
      .catch(() => undefined),
    useNotificationsStore
      .getState()
      .refresh()
      .catch(() => undefined),
  ]);
}

const SAVE_DELAY_MS = 600;

/**
 * Send settings changes to the server shortly after the user stops toggling. Wake and sleep
 * times live in the onboarding profile, so they go to a different endpoint.
 */
export function startPreferenceSync(): () => void {
  if (DEMO_MODE) return () => undefined;
  let previous = usePreferencesStore.getState();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let prefsDirty = false;
  let timesDirty = false;

  const flush = async () => {
    const state = usePreferencesStore.getState();
    const sendPrefs = prefsDirty;
    const sendTimes = timesDirty;
    prefsDirty = false;
    timesDirty = false;
    try {
      if (sendPrefs) await preferencesApi.update(preferencesToApi(state));
      if (sendTimes) {
        await profileApi.saveOnboarding({
          wake_time: WAKE_TIMES[state.wakeTime],
          sleep_time: SLEEP_TIMES[state.sleepTime],
        });
      }
    } catch (e) {
      reportFailure(e, 'Couldn’t save your settings. Check your connection and try again.');
    }
  };

  const unsubscribe = usePreferencesStore.subscribe((state) => {
    const before = previous;
    previous = state;
    if (applyingRemote) return;
    const prefsChanged =
      state.tone !== before.tone ||
      state.useName !== before.useName ||
      state.includeStreak !== before.includeStreak ||
      state.useEmojis !== before.useEmojis ||
      state.habitStacking !== before.habitStacking ||
      state.notifications !== before.notifications ||
      state.quietHours !== before.quietHours;
    const timesChanged = state.wakeTime !== before.wakeTime || state.sleepTime !== before.sleepTime;
    if (!prefsChanged && !timesChanged) return;
    prefsDirty ||= prefsChanged;
    timesDirty ||= timesChanged;
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), SAVE_DELAY_MS);
  });

  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}

/** What pull-to-refresh runs: re-download everything for a server account; nothing to do in demo mode. */
export async function refreshData(): Promise<void> {
  if (DEMO_MODE) return;
  await syncData();
}
