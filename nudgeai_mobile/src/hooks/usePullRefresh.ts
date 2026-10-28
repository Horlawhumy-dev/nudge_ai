import { useCallback, useState } from 'react';

import { toast } from '@/store/useToastStore';

/** Long enough that the spinner reads as "refreshed" instead of a flicker on a fast network. */
const MIN_SPINNER_MS = 500;

/**
 * State for a pull-down-to-refresh gesture. Pass the result to a `RefreshControl`
 * (or to `Screen`'s `onRefresh`). A failed refresh shows a toast instead of failing silently.
 */
export function usePullRefresh(
  refresh?: () => Promise<unknown>,
  minSpinnerMs: number = MIN_SPINNER_MS
) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    if (!refresh) return;
    setRefreshing(true);
    try {
      await Promise.all([refresh(), new Promise((r) => setTimeout(r, minSpinnerMs))]);
    } catch {
      toast.error('Couldn’t refresh. Check your connection and try again.');
    } finally {
      setRefreshing(false);
    }
  }, [refresh, minSpinnerMs]);

  return { refreshing, onRefresh };
}
