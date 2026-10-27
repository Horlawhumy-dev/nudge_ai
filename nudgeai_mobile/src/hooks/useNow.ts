import { useEffect, useState } from 'react';

/**
 * The current time, refreshed on an interval. Screens that derive "today", overdue or
 * "done today" from the clock use this so they roll over at midnight without a reload.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
