import { preferencesApi } from '@/services/api/endpoints/preferences';
import { usePreferencesStore } from '@/store/usePreferencesStore';

import { startPreferenceSync } from '../sync';

jest.mock('@/constants/env', () => ({ API_URL: 'http://api.test', DEMO_MODE: false }));
jest.mock('@/services/api/endpoints/preferences', () => ({
  ...jest.requireActual('@/services/api/endpoints/preferences'),
  preferencesApi: { get: jest.fn(), update: jest.fn() },
}));
jest.mock('@/services/api/endpoints/profile', () => ({
  profileApi: { saveOnboarding: jest.fn(), getOnboarding: jest.fn() },
}));

const update = jest.mocked(preferencesApi.update);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  update.mockResolvedValue({} as never);
  usePreferencesStore.getState().reset();
});
afterEach(() => jest.useRealTimers());

describe('preference sync', () => {
  it('sends one save after a burst of toggles', async () => {
    const stop = startPreferenceSync();
    usePreferencesStore.getState().setNotification('push', false);
    usePreferencesStore.getState().setNotification('voice', false);
    usePreferencesStore.getState().set({ tone: 'firm' });
    expect(update).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(700);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ push_enabled: false, voice_enabled: false, reminder_tone: 'firm' })
    );
    stop();
  });

  it('ignores changes that are not settings (plan, goals)', async () => {
    const stop = startPreferenceSync();
    usePreferencesStore.getState().set({ plan: 'pro', goals: ['fitness'] });
    await jest.advanceTimersByTimeAsync(700);
    expect(update).not.toHaveBeenCalled();
    stop();
  });

  it('stops saving once stopped', async () => {
    const stop = startPreferenceSync();
    stop();
    usePreferencesStore.getState().set({ tone: 'firm' });
    await jest.advanceTimersByTimeAsync(700);
    expect(update).not.toHaveBeenCalled();
  });
});
