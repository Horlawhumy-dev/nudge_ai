import { dateKey, diffDays } from '@/lib/date';

import type { NudgeNotification } from './types';

export function unreadCount(items: readonly NudgeNotification[]): number {
  return items.filter((n) => !n.read).length;
}

/** "Just now", "12 min ago", "3 h ago", "Yesterday", "Mon, May 11". */
export function formatAge(createdAt: number, now: number = Date.now()): string {
  const minutes = Math.floor((now - createdAt) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24 && dateKey(new Date(createdAt)) === dateKey(new Date(now)))
    return `${hours} h ago`;
  const days = diffDays(dateKey(new Date(createdAt)), dateKey(new Date(now)));
  if (days === 1) return 'Yesterday';
  return new Date(createdAt).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export type NotificationGroup = { title: 'Today' | 'Earlier'; items: NudgeNotification[] };

/** Newest first, split into Today / Earlier; empty groups are dropped. */
export function groupNotifications(
  items: readonly NudgeNotification[],
  now: number = Date.now()
): NotificationGroup[] {
  const today = dateKey(new Date(now));
  const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);
  const groups: NotificationGroup[] = [
    { title: 'Today', items: sorted.filter((n) => dateKey(new Date(n.createdAt)) === today) },
    { title: 'Earlier', items: sorted.filter((n) => dateKey(new Date(n.createdAt)) !== today) },
  ];
  return groups.filter((g) => g.items.length > 0);
}
