import { act, renderHook } from '@testing-library/react-native';

import { useToastStore } from '@/store/useToastStore';

import { usePullRefresh } from '../usePullRefresh';

const MIN_MS = 40;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => useToastStore.setState({ current: null }));

describe('usePullRefresh', () => {
  it('spins while refreshing and stays up for the minimum time, so it never flickers', async () => {
    const refresh = jest.fn(async () => undefined); // finishes instantly
    const { result } = await renderHook(() => usePullRefresh(refresh, MIN_MS));
    expect(result.current.refreshing).toBe(false);

    let done!: Promise<void>;
    await act(async () => {
      done = result.current.onRefresh();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.refreshing).toBe(true); // the refresh itself is long over

    await act(async () => {
      await done;
    });
    expect(result.current.refreshing).toBe(false);
  });

  it('waits for a slow refresh, however long it takes', async () => {
    const refresh = jest.fn(() => wait(MIN_MS * 3));
    const { result } = await renderHook(() => usePullRefresh(refresh, MIN_MS));
    let done!: Promise<void>;
    await act(async () => {
      done = result.current.onRefresh();
      await wait(MIN_MS * 2);
    });
    expect(result.current.refreshing).toBe(true);
    await act(async () => {
      await done;
    });
    expect(result.current.refreshing).toBe(false);
  });

  it('tells the user when refreshing fails, and stops spinning', async () => {
    const refresh = jest.fn(async () => {
      throw new Error('offline');
    });
    const { result } = await renderHook(() => usePullRefresh(refresh, MIN_MS));
    await act(async () => {
      await result.current.onRefresh();
    });
    expect(result.current.refreshing).toBe(false);
    expect(useToastStore.getState().current).toMatchObject({
      tone: 'error',
      message: expect.stringMatching(/refresh/i),
    });
  });

  it('does nothing without a refresh function', async () => {
    const { result } = await renderHook(() => usePullRefresh(undefined, MIN_MS));
    await act(async () => {
      await result.current.onRefresh();
    });
    expect(result.current.refreshing).toBe(false);
  });
});
