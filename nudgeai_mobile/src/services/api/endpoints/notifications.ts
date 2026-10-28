import type { NudgeKind, NudgeNotification } from '@/features/notifications/types';

import { api } from '../client';

type ApiNotification = {
  id: string;
  kind: NudgeKind;
  title: string;
  body: string;
  habit_id: string | null;
  read: boolean;
  created_at: string;
};

const WEEKLY_REPORT_TITLE = 'Your weekly report';

/** Where tapping a notification goes, decided from what it is. */
function hrefFor(n: ApiNotification): NudgeNotification['href'] {
  if (n.title === WEEKLY_REPORT_TITLE) return '/report';
  switch (n.kind) {
    case 'nudge':
      return '/habits';
    case 'streak':
      return '/streak';
    case 'insight':
      return '/progress';
    default:
      return '/home';
  }
}

export function notificationFromApi(n: ApiNotification): NudgeNotification {
  return {
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    createdAt: new Date(n.created_at).getTime(),
    read: n.read,
    href: hrefFor(n),
  };
}

export const notificationsApi = {
  async list(limit = 50) {
    const { data } = await api.get<{ items: ApiNotification[] }>('/notifications', {
      params: { limit },
    });
    return data.items.map(notificationFromApi);
  },
  async markRead(id: string) {
    await api.post(`/notifications/${id}/read`);
  },
  async markAllRead() {
    await api.post('/notifications/read-all');
  },
  async remove(id: string) {
    await api.delete(`/notifications/${id}`);
  },
  async restore(id: string) {
    await api.post(`/notifications/${id}/restore`);
  },
};

export const devicesApi = {
  /** Idempotent: safe to call on every launch. */
  async register(token: string, platform: 'ios' | 'android' | 'web') {
    await api.post('/devices', { token, platform });
  },
  async unregister(token: string) {
    await api.delete('/devices', { params: { token } });
  },
};
