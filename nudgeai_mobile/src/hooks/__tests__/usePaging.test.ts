import { act, renderHook } from '@testing-library/react-native';

import { usePaging } from '../usePaging';

const items = Array.from({ length: 12 }, (_, i) => i);

describe('usePaging', () => {
  it('shows five, then five more each time, until everything is shown', async () => {
    const { result } = await renderHook(() => usePaging(items));
    expect(result.current.visible).toHaveLength(5);
    expect(result.current.remaining).toBe(7);
    await act(async () => result.current.more());
    expect(result.current.visible).toHaveLength(10);
    expect(result.current.remaining).toBe(2);
    await act(async () => result.current.more());
    expect(result.current.visible).toEqual(items);
    expect(result.current.remaining).toBe(0);
  });

  it('has nothing to page when the list is short', async () => {
    const { result } = await renderHook(() => usePaging([1, 2, 3]));
    expect(result.current.visible).toEqual([1, 2, 3]);
    expect(result.current.remaining).toBe(0);
  });
});

describe('usePaging reset', () => {
  it('starts again from the first page when the key changes', async () => {
    const { result, rerender } = await renderHook(
      ({ key }: { key: string }) => usePaging(items, 5, key),
      { initialProps: { key: 'All' } }
    );
    await act(async () => result.current.more());
    expect(result.current.visible).toHaveLength(10);
    await rerender({ key: 'Morning' });
    expect(result.current.visible).toHaveLength(5);
  });
});
