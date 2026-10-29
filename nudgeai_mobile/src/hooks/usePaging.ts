import { useState } from 'react';

/** Pass `resetKey` (e.g. the active filter) to start again from the first page when it changes. */

export const PAGE_SIZE = 5;

/** Show a long list a page at a time: the first `size` items, then `size` more on each `more()`. */
export function usePaging<T>(items: readonly T[], size = PAGE_SIZE, resetKey?: unknown) {
  const [state, setState] = useState({ key: resetKey, shown: size });
  const shown = Object.is(state.key, resetKey) ? state.shown : size;
  const visible = items.slice(0, shown);
  return {
    visible,
    remaining: Math.max(0, items.length - shown),
    /** More than the first page is showing. */
    expanded: shown > size,
    less: () => setState({ key: resetKey, shown: size }),
    more: () => setState({ key: resetKey, shown: shown + size }),
  };
}
