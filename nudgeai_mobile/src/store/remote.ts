import { ApiError } from '@/services/api/errors';

import { toast } from './useToastStore';

/**
 * Helpers for stores that update the screen first and tell the server afterwards.
 *
 * - Records created offline-style get a temporary id; `trackNew` remembers the server id once it
 *   arrives, and `resolveId` lets later actions on that record wait for it.
 * - `serial` runs one record's calls in order, so a quick tick-untick-tick reaches the server in
 *   the same order the user did it.
 */
const pendingIds = new Map<string, Promise<string>>();
const chains = new Map<string, Promise<unknown>>();

export function trackNew(tempId: string, serverId: Promise<string>): void {
  pendingIds.set(tempId, serverId);
  const done = () => pendingIds.delete(tempId);
  serverId.then(done, done);
}

export function resolveId(id: string): Promise<string> {
  return pendingIds.get(id) ?? Promise.resolve(id);
}

export function serial<T>(key: string, job: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  const next = previous.then(job, job);
  chains.set(key, next);
  const clean = () => {
    if (chains.get(key) === next) chains.delete(key);
  };
  next.then(clean, clean);
  return next;
}

/** Tell the user why a change didn't stick, in the server's words when it gave any. */
export function reportFailure(e: unknown, fallback: string): void {
  if (e instanceof ApiError && !e.isNetwork && e.message) toast.error(e.message);
  else toast.error(fallback);
}
