import { notificationFromApi, notificationsApi } from '@/services/api/endpoints/notifications';
import { ApiError } from '@/services/api/errors';

import { useNotificationsStore } from '../useNotificationsStore';
import { useToastStore } from '../useToastStore';

jest.mock('@/constants/env', () => ({ API_URL: 'http://api.test', DEMO_MODE: false }));
jest.mock('@/services/api/endpoints/notifications', () => ({
  ...jest.requireActual('@/services/api/endpoints/notifications'),
  notificationsApi: {
    list: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
    remove: jest.fn(),
    restore: jest.fn(),
  },
}));

const api = jest.mocked(notificationsApi);
const flush = () => new Promise((r) => setTimeout(r, 0));
const item = (id: string, read = false) => ({
  id,
  kind: 'nudge' as const,
  title: 't',
  body: 'b',
  createdAt: 1,
  read,
});

beforeEach(() => {
  jest.resetAllMocks();
  api.markRead.mockResolvedValue(undefined);
  api.markAllRead.mockResolvedValue(undefined);
  api.restore.mockResolvedValue(undefined);
  useNotificationsStore.setState({ items: [item('a'), item('b')] });
  useToastStore.setState({ current: null });
});

describe('inbox', () => {
  it('tells the server what the user read, at once on screen', () => {
    useNotificationsStore.getState().markRead('a');
    expect(useNotificationsStore.getState().items[0].read).toBe(true);
    expect(api.markRead).toHaveBeenCalledWith('a');
    useNotificationsStore.getState().markAllRead();
    expect(api.markAllRead).toHaveBeenCalled();
  });

  it('puts a notification back if the delete fails', async () => {
    api.remove.mockRejectedValue(new ApiError('offline', 0));
    useNotificationsStore.getState().dismiss('a');
    expect(useNotificationsStore.getState().items.map((n) => n.id)).toEqual(['b']);
    await flush();
    expect(
      useNotificationsStore
        .getState()
        .items.map((n) => n.id)
        .sort()
    ).toEqual(['a', 'b']);
    expect(useToastStore.getState().current?.tone).toBe('error');
  });

  it('undo restores it on the server', () => {
    useNotificationsStore.getState().restore(item('z'));
    expect(api.restore).toHaveBeenCalledWith('z');
  });

  it('replaces the list with the server’s on refresh', async () => {
    api.list.mockResolvedValue([item('s1'), item('s2')]);
    await useNotificationsStore.getState().refresh();
    expect(useNotificationsStore.getState().items.map((n) => n.id)).toEqual(['s1', 's2']);
  });
});

describe('notificationFromApi', () => {
  const base = {
    id: '1',
    kind: 'summary' as const,
    title: 'Morning',
    body: 'b',
    habit_id: null,
    read: false,
    created_at: '2026-01-05T08:00:00Z',
  };

  it('converts the timestamp and picks a destination from the kind', () => {
    expect(notificationFromApi(base)).toMatchObject({
      createdAt: Date.parse('2026-01-05T08:00:00Z'),
      href: '/home',
    });
    expect(notificationFromApi({ ...base, kind: 'streak' }).href).toBe('/streak');
    expect(notificationFromApi({ ...base, kind: 'nudge' }).href).toBe('/habits');
    expect(notificationFromApi({ ...base, kind: 'insight' }).href).toBe('/progress');
    expect(notificationFromApi({ ...base, kind: 'reminder', task_id: 't1' }).href).toBe('/tasks');
  });

  it('opens the weekly report from its inbox message', () => {
    expect(
      notificationFromApi({ ...base, kind: 'insight', title: 'Your weekly report' }).href
    ).toBe('/report');
  });
});
