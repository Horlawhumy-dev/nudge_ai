import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

type AutoAdvanceOptions = {
  index: number;
  count: number;
  /** Pause while the user is dragging or otherwise interacting. */
  paused: boolean;
  delayMs: number;
  onAdvance: (nextIndex: number) => void;
};

/**
 * Calls `onAdvance(index + 1)` after `delayMs` on each page except the last. The timer restarts whenever
 * the index changes (including manual swipes) and is off for users who prefer reduced motion.
 */
export function useAutoAdvance({
  index,
  count,
  paused,
  delayMs,
  onAdvance,
}: AutoAdvanceOptions): void {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => active && setReduceMotion(enabled))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (paused || reduceMotion || index >= count - 1) return;
    const id = setTimeout(() => onAdvance(index + 1), delayMs);
    return () => clearTimeout(id);
  }, [index, count, paused, reduceMotion, delayMs, onAdvance]);
}
