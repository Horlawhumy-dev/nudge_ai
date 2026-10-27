import { useAuthStore } from './useAuthStore';
import { useHabitsStore } from './useHabitsStore';
import { useOnboardingStore } from './useOnboardingStore';
import { usePreferencesStore } from './usePreferencesStore';
import { useTasksStore } from './useTasksStore';

const persistedStores = [
  useAuthStore,
  useHabitsStore,
  useTasksStore,
  usePreferencesStore,
  useOnboardingStore,
];

/** Resolves once every persisted store has loaded its saved state from disk. */
export function whenHydrated(): Promise<void> {
  return Promise.all(
    persistedStores.map(
      (store) =>
        new Promise<void>((resolve) => {
          if (store.persist.hasHydrated()) resolve();
          else store.persist.onFinishHydration(() => resolve());
        })
    )
  ).then(() => undefined);
}
