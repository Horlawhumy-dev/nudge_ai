import { create } from 'zustand';

import { sleep } from '@/lib/format';

import { useHabitsStore } from './useHabitsStore';
import { usePreferencesStore } from './usePreferencesStore';
import { useTasksStore } from './useTasksStore';

export type User = {
  id: string;
  /** Full name from sign-up; shown on the profile. */
  name: string;
  /** What reminders call the user (set in onboarding). Falls back to the first name. */
  nickname?: string;
  email: string;
};

/** The short name used in greetings and AI replies. */
export function displayName(user: User | null): string {
  if (!user) return '';
  return user.nickname?.trim() || user.name.trim().split(/\s+/)[0] || '';
}

/** Where the user is in the sign-in funnel; routes read this to decide what to show. */
export type SessionStatus = 'signedOut' | 'unverified' | 'onboarding' | 'ready';

type AuthState = {
  status: SessionStatus;
  user: User | null;
  /** Email a reset code or verification code was sent to. */
  pendingEmail: string | null;
  hasSeenIntro: boolean;

  markIntroSeen: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (password: string) => Promise<void>;
  completeOnboarding: (nickname: string) => void;
  updateProfile: (patch: Partial<Pick<User, 'name' | 'email'>>) => void;
  signOut: () => void;
};

const MOCK_LATENCY_MS = 600;
const DEMO_USER: User = {
  id: 'user_demo',
  name: 'Rophy Alade',
  nickname: 'Rophy',
  email: 'aladexrofiah@gmail.com',
};

/**
 * Static session: no network. Every method is async and takes a beat so the screens exercise
 * their loading states; replace the bodies with API calls when the backend is wired in.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'signedOut',
  user: null,
  pendingEmail: null,
  hasSeenIntro: false,

  markIntroSeen: () => set({ hasSeenIntro: true }),

  signIn: async (email) => {
    await sleep(MOCK_LATENCY_MS);
    useHabitsStore.getState().seedDemo();
    useTasksStore.getState().seedDemo();
    set({ status: 'ready', user: { ...DEMO_USER, email: email.trim() || DEMO_USER.email } });
  },

  signUp: async (name, email) => {
    await sleep(MOCK_LATENCY_MS);
    useHabitsStore.getState().clear();
    useTasksStore.getState().clear();
    usePreferencesStore.getState().reset();
    set({
      status: 'unverified',
      user: { id: 'user_new', name: name.trim(), email: email.trim() },
      pendingEmail: email.trim(),
    });
  },

  verifyEmail: async () => {
    await sleep(MOCK_LATENCY_MS);
    set({ status: 'onboarding' });
  },

  requestPasswordReset: async (email) => {
    await sleep(MOCK_LATENCY_MS);
    set({ pendingEmail: email.trim() });
  },

  resetPassword: async () => {
    await sleep(MOCK_LATENCY_MS);
    set({ pendingEmail: null });
  },

  completeOnboarding: (nickname) => {
    const { user } = get();
    set({
      status: 'ready',
      user: user ? { ...user, nickname: nickname.trim() || user.nickname } : user,
    });
  },

  updateProfile: (patch) => set((s) => (s.user ? { user: { ...s.user, ...patch } } : s)),

  signOut: () => set({ status: 'signedOut', user: null, pendingEmail: null }),
}));
