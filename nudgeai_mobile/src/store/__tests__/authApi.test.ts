import { authApi } from '@/services/api/endpoints/auth';
import { profileApi } from '@/services/api/endpoints/profile';
import { ApiError } from '@/services/api/errors';

import { AuthError, useAuthStore } from '../useAuthStore';
import { useHabitsStore } from '../useHabitsStore';

// Same store, but with a backend configured instead of demo mode.
jest.mock('@/constants/env', () => ({
  API_URL: 'http://api.test/v1',
  DEMO_MODE: false,
  DEMO_EMAIL: 'demo@nudge.ai',
  DEMO_PASSWORD: 'Password1!',
  DEMO_CODE: '1234',
}));
jest.mock('@/services/api/endpoints/auth');
jest.mock('@/services/api/endpoints/profile');
jest.mock('@/services/sync', () => ({ syncData: jest.fn(async () => undefined) }));
jest.mock('@/services/api/tokens', () => ({
  getTokens: jest.fn(async () => ({ accessToken: 'a', refreshToken: 'r' })),
  onSessionExpired: jest.fn(),
}));

const auth = jest.mocked(authApi);
const profile = jest.mocked(profileApi);

const apiUser = {
  id: 'u1',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  timezone: 'UTC',
  is_email_verified: true,
  plan: 'free' as const,
  avatar_url: null,
  avatar_thumb_url: null,
  pending_email: null,
  created_at: '2026-01-01T00:00:00Z',
};
const onboarding = (completed: boolean) => ({
  name: 'Ada',
  wake_time: '07:30',
  sleep_time: '23:00',
  goals: [],
  nudge_style: 'gentle',
  completed,
});

beforeEach(() => {
  jest.clearAllMocks();
  auth.resendCode.mockResolvedValue(undefined);
  auth.logIn.mockReset().mockResolvedValue(undefined); // a failing login must not leak into the next test
  useAuthStore.setState({
    status: 'signedOut',
    user: null,
    pendingEmail: null,
    resetCode: null,
    rememberedEmail: null,
  });
  useHabitsStore.getState().clear();
});

describe('auth store with a backend', () => {
  it('signs in and lands in the app when onboarding is done', async () => {
    profile.get.mockResolvedValue(apiUser);
    profile.getOnboarding.mockResolvedValue(onboarding(true));
    await useAuthStore.getState().signIn(' ada@example.com ', 'Passw0rd!');
    expect(auth.logIn).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'Passw0rd!' });
    const s = useAuthStore.getState();
    expect(s.status).toBe('ready');
    expect(s.user).toMatchObject({ id: 'u1', name: 'Ada Lovelace', nickname: 'Ada' });
  });

  it('says what failed when login works but the account can’t be loaded', async () => {
    profile.get.mockResolvedValue(apiUser);
    profile.getOnboarding.mockRejectedValue(new ApiError('Method Not Allowed', 405));
    await expect(useAuthStore.getState().signIn('ada@example.com', 'Passw0rd!')).rejects.toThrow(
      /signed in, but we couldn’t load your account \(405: Method Not Allowed\)/
    );
    expect(useAuthStore.getState().status).toBe('signedOut');
  });

  it('sends a returning user who never finished onboarding back to it', async () => {
    profile.get.mockResolvedValue(apiUser);
    profile.getOnboarding.mockResolvedValue(onboarding(false));
    await useAuthStore.getState().signIn('ada@example.com', 'Passw0rd!');
    expect(useAuthStore.getState().status).toBe('onboarding');
  });

  it('shows the server’s message for a wrong password', async () => {
    auth.logIn.mockRejectedValue(new ApiError('incorrect email or password', 401));
    await expect(useAuthStore.getState().signIn('a@b.co', 'x')).rejects.toThrow(
      'incorrect email or password'
    );
    expect(useAuthStore.getState().status).toBe('signedOut');
  });

  it('resumes email verification when the account was never confirmed', async () => {
    auth.logIn.mockRejectedValue(new ApiError('verify your email first', 403));
    await expect(useAuthStore.getState().signIn('ada@example.com', 'x')).rejects.toBeInstanceOf(
      AuthError
    );
    expect(useAuthStore.getState()).toMatchObject({
      status: 'unverified',
      pendingEmail: 'ada@example.com',
    });
    expect(auth.resendCode).toHaveBeenCalledWith('ada@example.com');
  });

  it('remembers the email once someone signs in, and keeps it after sign-out', async () => {
    profile.get.mockResolvedValue(apiUser);
    profile.getOnboarding.mockResolvedValue(onboarding(true));
    await useAuthStore.getState().signIn('ada@example.com', 'Passw0rd!');
    expect(useAuthStore.getState().rememberedEmail).toBe('ada@example.com');

    await useAuthStore.getState().signOut();
    expect(useAuthStore.getState()).toMatchObject({
      status: 'signedOut',
      rememberedEmail: 'ada@example.com', // so login only asks for the password
    });
    // saved to disk, but never the password or anything secret
    const saved = useAuthStore.persist.getOptions().partialize?.(useAuthStore.getState());
    expect(saved).toMatchObject({ rememberedEmail: 'ada@example.com' });
    expect(JSON.stringify(saved)).not.toMatch(/password|token/i);
  });

  it('remembers the email of a brand-new account after it verifies', async () => {
    auth.signUp.mockResolvedValue(apiUser);
    await useAuthStore.getState().signUp('Ada', 'ada@example.com', 'Passw0rd!');
    expect(useAuthStore.getState().rememberedEmail).toBeNull(); // not registered until verified
    profile.get.mockResolvedValue(apiUser);
    profile.getOnboarding.mockResolvedValue(onboarding(false));
    await useAuthStore.getState().verifyEmail('4821');
    expect(useAuthStore.getState().rememberedEmail).toBe('ada@example.com');
  });

  it('"Not you?" forgets it, and deleting the account does too', async () => {
    useAuthStore.setState({ rememberedEmail: 'ada@example.com' });
    useAuthStore.getState().forgetRememberedEmail();
    expect(useAuthStore.getState().rememberedEmail).toBeNull();

    useAuthStore.setState({
      status: 'ready',
      user: { id: 'u1', name: 'Ada', email: 'ada@example.com' },
      rememberedEmail: 'ada@example.com',
    });
    await useAuthStore.getState().deleteAccount('Passw0rd!');
    expect(useAuthStore.getState().rememberedEmail).toBeNull();
  });

  it('does not remember "waiting for the code" across app restarts', () => {
    const { partialize, merge } = useAuthStore.persist.getOptions();
    const waiting = {
      ...useAuthStore.getState(),
      status: 'unverified' as const,
      user: { id: 'u', name: 'Ada', email: 'ada@example.com' },
      pendingEmail: 'ada@example.com',
    };
    expect(partialize?.(waiting)).toMatchObject({
      status: 'signedOut',
      user: null,
      pendingEmail: null,
    });

    // a phone that already saved the old state is cleaned up when it loads it
    const current = useAuthStore.getState();
    const merged = merge?.(
      { status: 'unverified', user: { id: 'u' }, hasSeenIntro: true },
      current
    );
    expect(merged).toMatchObject({ status: 'signedOut', user: null, hasSeenIntro: true });

    // signed-in sessions are kept
    const kept = merge?.({ status: 'ready', user: { id: 'u' } }, current);
    expect(kept).toMatchObject({ status: 'ready', user: { id: 'u' } });
  });

  it('blames the email field when sign-up says it is taken', async () => {
    auth.signUp.mockRejectedValue(new ApiError('email already registered', 409));
    const err = await useAuthStore
      .getState()
      .signUp('Ada', 'ada@example.com', 'Passw0rd!')
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ name: 'AuthError', field: 'email' });
  });

  it('signs up, verifies with the emailed code and moves on to onboarding', async () => {
    auth.signUp.mockResolvedValue(apiUser);
    await useAuthStore.getState().signUp('Ada Lovelace', 'ada@example.com', 'Passw0rd!');
    expect(auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ada@example.com', name: 'Ada Lovelace' })
    );
    expect(useAuthStore.getState().status).toBe('unverified');

    profile.get.mockResolvedValue(apiUser);
    profile.getOnboarding.mockResolvedValue(onboarding(false));
    await useAuthStore.getState().verifyEmail('4821');
    expect(auth.verifyEmail).toHaveBeenCalledWith({ email: 'ada@example.com', code: '4821' });
    expect(useAuthStore.getState().status).toBe('onboarding');
  });

  it('sends an already-verified account to sign in instead of leaving them on the verify screen', async () => {
    useAuthStore.setState({ status: 'unverified', pendingEmail: 'ada@example.com' });
    auth.verifyEmail.mockRejectedValue(new ApiError('email already verified', 409));
    const outcome = await useAuthStore.getState().verifyEmail('1234');
    expect(outcome).toBe('already-verified');
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', pendingEmail: null });
  });

  it('blames the code field for a wrong code', async () => {
    useAuthStore.setState({ pendingEmail: 'ada@example.com' });
    auth.verifyEmail.mockRejectedValue(new ApiError('invalid or expired code', 400));
    await expect(useAuthStore.getState().verifyEmail('0000')).rejects.toMatchObject({
      field: 'code',
    });
  });

  it('explains rate limiting with the wait time', async () => {
    useAuthStore.setState({ pendingEmail: 'ada@example.com' });
    auth.verifyEmail.mockRejectedValue(new ApiError('too many', 429, {}, 30));
    await expect(useAuthStore.getState().verifyEmail('0000')).rejects.toThrow(/30s/);
  });

  it('carries the verified reset code through to the new password', async () => {
    await useAuthStore.getState().requestPasswordReset('ada@example.com');
    await useAuthStore.getState().verifyResetCode('9911');
    await useAuthStore.getState().resetPassword('N3wPassw0rd!');
    expect(auth.resetPassword).toHaveBeenCalledWith({
      email: 'ada@example.com',
      code: '9911',
      new_password: 'N3wPassw0rd!',
    });
    expect(useAuthStore.getState().resetCode).toBeNull();
  });

  it('signs out on the server and wipes the account’s local data', async () => {
    useAuthStore.setState({ status: 'ready' });
    useHabitsStore.getState().addHabit({
      name: 'Read',
      emoji: '📚',
      category: 'Learning',
      timeOfDay: 'Evening',
      frequency: 'Daily',
    });
    await useAuthStore.getState().signOut();
    expect(auth.logOut).toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(useHabitsStore.getState().habits).toEqual([]);
  });

  it('keeps a saved session when the app starts offline', async () => {
    useAuthStore.setState({ status: 'ready', user: { id: 'u1', name: 'Ada', email: 'a@b.co' } });
    profile.get.mockRejectedValue(new ApiError('offline', 0));
    profile.getOnboarding.mockRejectedValue(new ApiError('offline', 0));
    await useAuthStore.getState().restoreSession();
    expect(useAuthStore.getState().status).toBe('ready');
  });

  it('shows the new photo at once and puts the old one back if the upload fails', async () => {
    useAuthStore.setState({
      status: 'ready',
      user: { id: 'u1', name: 'Ada', email: 'a@b.co', avatarUri: 'https://old/photo.jpg' },
    });
    profile.uploadAvatar.mockImplementation(async () => {
      expect(useAuthStore.getState().user?.avatarUri).toBe('file:///new.jpg'); // already on screen
      throw new ApiError('we couldn’t save your photo just now, please try again', 503);
    });
    await expect(useAuthStore.getState().changePhoto('file:///new.jpg')).rejects.toThrow(
      /try again/
    );
    expect(useAuthStore.getState().user?.avatarUri).toBe('https://old/photo.jpg');
  });

  it('keeps the server’s photo URLs once the upload succeeds', async () => {
    useAuthStore.setState({ status: 'ready', user: { id: 'u1', name: 'Ada', email: 'a@b.co' } });
    profile.uploadAvatar.mockResolvedValue({
      ...apiUser,
      avatar_url: 'https://cdn/full.jpg',
      avatar_thumb_url: 'https://cdn/thumb.jpg',
    });
    await useAuthStore.getState().changePhoto('file:///new.jpg');
    expect(useAuthStore.getState().user).toMatchObject({
      avatarUri: 'https://cdn/full.jpg',
      avatarThumbUri: 'https://cdn/thumb.jpg',
    });
  });

  it('deletes the account with the password and signs out', async () => {
    useAuthStore.setState({ status: 'ready', user: { id: 'u1', name: 'Ada', email: 'a@b.co' } });
    await useAuthStore.getState().deleteAccount('Passw0rd!');
    expect(auth.deleteAccount).toHaveBeenCalledWith('Passw0rd!');
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', user: null });
  });

  it('stays signed in when the password is wrong', async () => {
    useAuthStore.setState({ status: 'ready', user: { id: 'u1', name: 'Ada', email: 'a@b.co' } });
    auth.deleteAccount.mockRejectedValue(new ApiError('incorrect password', 403));
    await expect(useAuthStore.getState().deleteAccount('nope')).rejects.toThrow(
      'incorrect password'
    );
    expect(useAuthStore.getState().status).toBe('ready');
  });
});
