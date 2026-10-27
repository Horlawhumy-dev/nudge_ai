import * as Haptics from 'expo-haptics';

/** Fire-and-forget: haptics are a nicety, so failures (no engine, web, low power) are swallowed. */
function run(fn: () => Promise<void>): void {
  try {
    void fn().catch(() => undefined);
  } catch {
    // module unavailable (tests, unsupported platform)
  }
}

export const haptics = {
  /** Light tap for presses on primary controls. */
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Tick for selection changes (chips, toggles, options). */
  select: () => run(() => Haptics.selectionAsync()),
  /** Completed something: habit ticked, saved, sent. */
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
