import { SLEEP_TIMES, WAKE_TIMES, type ToneId } from '@/features/onboarding/data';
import { parseClock } from '@/features/settings/utils';
import type { QuietHours, Weekday } from '@/store/usePreferencesStore';

import { api } from '../client';
import type { ApiPreferences } from '../types';

/** Monday = 0, matching the backend's `quiet_repeat_days`. */
const WEEKDAYS: readonly Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SAT = 5;
const SUN = 6;

const pad = (n: number) => String(n).padStart(2, '0');

/** "10:00 PM" → "22:00". */
export function to24h(clock: string): string {
  const minutes = parseClock(clock);
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** "22:00" → "10:00 PM". */
export function to12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${suffix}`;
}

export function quietToApi(q: QuietHours) {
  const days = q.days.map((d) => WEEKDAYS.indexOf(d));
  if (q.weekends) days.push(SAT, SUN);
  return {
    quiet_enabled: q.enabled,
    quiet_start: to24h(q.from),
    quiet_end: to24h(q.to),
    quiet_allow_priority: q.allowHighPriority,
    quiet_repeat_days: [...new Set(days)].sort((a, b) => a - b),
  };
}

export function quietFromApi(p: ApiPreferences, fallback: QuietHours): QuietHours {
  const days = p.quiet_repeat_days ?? [];
  const weekends = days.includes(SAT) && days.includes(SUN);
  return {
    enabled: p.quiet_enabled,
    from: p.quiet_start ? to12h(p.quiet_start) : fallback.from,
    to: p.quiet_end ? to12h(p.quiet_end) : fallback.to,
    allowHighPriority: p.quiet_allow_priority,
    days: days.filter((d) => d < SAT).map((d) => WEEKDAYS[d]),
    weekends,
  };
}

type PrefsInput = {
  tone: ToneId;
  useName: boolean;
  includeStreak: boolean;
  useEmojis: boolean;
  habitStacking: boolean;
  notifications: {
    push: boolean;
    voice: boolean;
    morningSummary: boolean;
    weeklyReport: boolean;
    streakAlerts: boolean;
  };
  quietHours: QuietHours;
};

export function preferencesToApi(p: PrefsInput) {
  return {
    push_enabled: p.notifications.push,
    voice_enabled: p.notifications.voice,
    morning_summary_enabled: p.notifications.morningSummary,
    weekly_report_enabled: p.notifications.weeklyReport,
    streak_alerts_enabled: p.notifications.streakAlerts,
    reminder_tone: p.tone,
    use_name_in_reminders: p.useName,
    include_streak_in_reminders: p.includeStreak,
    use_emojis_in_reminders: p.useEmojis,
    habit_stacking_enabled: p.habitStacking,
    ...quietToApi(p.quietHours),
  };
}

export function preferencesFromApi(p: ApiPreferences, current: { quietHours: QuietHours }) {
  return {
    tone: (['gentle', 'firm', 'mix'].includes(p.reminder_tone)
      ? p.reminder_tone
      : 'gentle') as ToneId,
    useName: p.use_name_in_reminders,
    includeStreak: p.include_streak_in_reminders,
    useEmojis: p.use_emojis_in_reminders,
    habitStacking: p.habit_stacking_enabled,
    notifications: {
      push: p.push_enabled,
      voice: p.voice_enabled,
      morningSummary: p.morning_summary_enabled,
      weeklyReport: p.weekly_report_enabled,
      streakAlerts: p.streak_alerts_enabled,
    },
    quietHours: quietFromApi(p, current.quietHours),
  };
}

/** The onboarding answer ("7-8") nearest to a stored clock time ("07:30"). */
function nearest(map: Record<string, string>, time: string | null, fallback: string): string {
  if (!time) return fallback;
  const target = parseClock(to12h(time));
  let best = fallback;
  let gap = Infinity;
  for (const [id, t] of Object.entries(map)) {
    const raw = Math.abs(parseClock(to12h(t)) - target);
    const d = Math.min(raw, 1440 - raw); // closeness wraps around midnight
    if (d < gap) {
      gap = d;
      best = id;
    }
  }
  return best;
}

export const wakeIdFromTime = (t: string | null) => nearest(WAKE_TIMES, t, '7-8');
export const sleepIdFromTime = (t: string | null) => nearest(SLEEP_TIMES, t, '1030-12');

export const preferencesApi = {
  async get() {
    const { data } = await api.get<ApiPreferences>('/preferences');
    return data;
  },

  async update(body: Partial<ReturnType<typeof preferencesToApi>>) {
    const { data } = await api.patch<ApiPreferences>('/preferences', body);
    return data;
  },
};
