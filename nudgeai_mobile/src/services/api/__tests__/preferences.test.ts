import {
  preferencesFromApi,
  preferencesToApi,
  quietFromApi,
  quietToApi,
  sleepIdFromTime,
  to12h,
  to24h,
  wakeIdFromTime,
} from '../endpoints/preferences';
import type { ApiPreferences } from '../types';

const quiet = {
  enabled: true,
  from: '10:00 PM',
  to: '7:00 AM',
  days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const,
  allowHighPriority: true,
  weekends: false,
};

describe('clock conversion', () => {
  it('goes between 12 h display and 24 h wire format', () => {
    expect(to24h('10:00 PM')).toBe('22:00');
    expect(to24h('12:00 AM')).toBe('00:00');
    expect(to24h('12:30 PM')).toBe('12:30');
    expect(to12h('22:00')).toBe('10:00 PM');
    expect(to12h('00:15')).toBe('12:15 AM');
    expect(to12h('07:00')).toBe('7:00 AM');
  });
});

describe('quiet hours', () => {
  it('sends weekdays as Monday=0 numbers', () => {
    expect(quietToApi({ ...quiet, days: [...quiet.days] })).toEqual({
      quiet_enabled: true,
      quiet_start: '22:00',
      quiet_end: '07:00',
      quiet_allow_priority: true,
      quiet_repeat_days: [0, 1, 2, 3, 4],
    });
  });

  it('adds Saturday and Sunday when weekends is on', () => {
    const body = quietToApi({ ...quiet, days: ['Mon'], weekends: true });
    expect(body.quiet_repeat_days).toEqual([0, 5, 6]);
  });

  it('round-trips through the server shape', () => {
    const original = { ...quiet, days: ['Mon', 'Wed'] as ('Mon' | 'Wed')[], weekends: true };
    const wire = quietToApi(original);
    const back = quietFromApi({ ...wire } as unknown as ApiPreferences, original);
    expect(back).toEqual(original);
  });
});

describe('preferences', () => {
  const server: ApiPreferences = {
    quiet_start: '23:00',
    quiet_end: '06:30',
    quiet_repeat_days: [0, 1],
    quiet_enabled: false,
    quiet_allow_priority: false,
    voice_enabled: false,
    push_enabled: true,
    morning_summary_enabled: false,
    weekly_report_enabled: true,
    streak_alerts_enabled: false,
    reminder_tone: 'firm',
    use_name_in_reminders: false,
    include_streak_in_reminders: true,
    use_emojis_in_reminders: true,
    habit_stacking_enabled: false,
    timezone: 'UTC',
  };

  it('maps the server’s settings onto the app’s', () => {
    const p = preferencesFromApi(server, { quietHours: quiet as never });
    expect(p.tone).toBe('firm');
    expect(p.notifications).toEqual({
      push: true,
      voice: false,
      morningSummary: false,
      weeklyReport: true,
      streakAlerts: false,
    });
    expect(p.quietHours).toMatchObject({ from: '11:00 PM', to: '6:30 AM', days: ['Mon', 'Tue'] });
  });

  it('falls back to gentle for a tone the app does not know', () => {
    expect(
      preferencesFromApi({ ...server, reminder_tone: 'sarcastic' }, { quietHours: quiet as never })
        .tone
    ).toBe('gentle');
  });

  it('sends every setting the server stores', () => {
    const p = preferencesFromApi(server, { quietHours: quiet as never });
    const body = preferencesToApi(p);
    expect(body).toMatchObject({
      reminder_tone: 'firm',
      push_enabled: true,
      weekly_report_enabled: true,
      habit_stacking_enabled: false,
      quiet_start: '23:00',
    });
  });
});

describe('wake and sleep answers', () => {
  it('picks the nearest onboarding answer for a stored time', () => {
    expect(wakeIdFromTime('07:30')).toBe('7-8');
    expect(wakeIdFromTime('05:00')).toBe('before-6');
    expect(wakeIdFromTime('09:15')).toBe('after-8');
    expect(sleepIdFromTime('23:00')).toBe('1030-12');
    expect(sleepIdFromTime('01:00')).toBe('after-midnight');
    expect(sleepIdFromTime(null)).toBe('1030-12');
  });
});
