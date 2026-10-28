import { useCallback, useEffect, useState } from 'react';

/** Counts down from `seconds` once per second; `restart` resets it (optionally to another length). */
export function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  const restart = useCallback((next?: number) => setRemaining(next ?? seconds), [seconds]);

  return { remaining, isDone: remaining <= 0, restart };
}
