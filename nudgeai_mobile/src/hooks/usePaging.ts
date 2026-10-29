import { useState } from 'react';

export const PAGE_SIZE = 5;

/** Show a long list a page at a time: the first `size` items, then `size` more on each `more()`. */
export function usePaging<T>(items: readonly T[], size = PAGE_SIZE) {
  const [shown, setShown] = useState(size);
  const visible = items.slice(0, shown);
  return {
    visible,
    remaining: Math.max(0, items.length - shown),
    more: () => setShown((n) => n + size),
  };
}
