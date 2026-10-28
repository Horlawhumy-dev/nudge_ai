import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEMO_CODE, DEMO_EMAIL, DEMO_MODE, DEMO_PASSWORD } from '@/constants/env';
import { SLEEP_TIMES, WAKE_TIMES } from '@/features/onboarding/data';
import { sleep } from '@/lib/format';
import { ApiError } from '@/services/api/errors';
import { authApi } from '@/services/api/endpoints/auth';
import { profileApi } from '@/services/api/endpoints/profile';
import { getTokens, onSessionExpired } from '@/services/api/tokens';
import { syncData } from '@/services/sync';
import type { ApiUser } from '@/services/api/types';

import { useHabitsStore } from './useHabitsStore';
import { useChatStore } from './useChatStore';
import { useNotificationsStore } from './useNotificationsStore';
import { useOnboardingStore } from './useOnboardingStore';
import { usePreferencesStore } from './usePreferencesStore';
import { useTasksStore } from './useTasksStore';
import { persistStorage, STORE_VERSION } from './persist';
import { toast } from './useToastStore';

export type User = {
  id: string;
  /** Full name from sign-up; shown on the profile. */
  name: string;
  /** What reminders call the user (set in onboarding). Falls back to the first name. */
  nickname?: string;
  /** The profile photo: a local file while picking, the server's URL once saved. */
  avatarUri?: string;
  /** Small optimised copy of the photo for lists and headers (server accounts only). */
  avatarThumbUri?: string;
  email: string;
};

/** The short name used in greetings and AI replies. */
export function displayName(user: User | null): string {
  if (!user) return '';
  return user.nickname?.trim() || user.name.trim().split(/\s+/)[0] || '';
}

export type AuthField = 'email' | 'password' | 'code';

/** A failed auth call. `field` says which input to blame; without it the error is form-level. */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly field?: AuthField
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/** Turn a failed API call into the message and input the auth screens already know how to show. */
function authError(e: unknown, field?: AuthField): AuthError {
  if (e instanceof AuthError) return e;
  if (!(e instanceof ApiError)) return new AuthError('Something went wrong. Please try again.');
  if (e.isNetwork) return new AuthError(e.message);
  if (e.isRateLimited) {
    const wait = e.retryAfter ? ` Try again in ${e.retryAfter}s.` : ' Try again in a moment.';
    return new AuthError(`Too many attempts.${wait}`, field);
  }
  const inField = (['email', 'password', 'code'] as const).find((f) => e.fields[f]);
  return new AuthError(e.message, inField ?? field);
}

function fromApi(u: ApiUser, nickname?: string): User {
  return {
    id: u.id,
    name: u.name ?? '',
    email: u.email,
    nickname,
    avatarUri: u.avatar_url ?? undefined,
    avatarThumbUri: u.avatar_thumb_url ?? undefined,
  };
}

const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Where the user is in the sign-in funnel; routes read this to decide what to show. */
export type SessionStatus = 'signedOut' | 'unverified' | 'onboarding' | 'ready';

type AuthState = {
  status: SessionStatus;
  user: User | null;
  /** Email a reset code or verification code was sent to. */
  pendingEmail: string | null;
  hasSeenIntro: boolean;
  /** The emailed reset code, kept in memory between the "enter code" and "new password" screens. */
  resetCode: string | null;

  markIntroSeen: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  resendCode: () => Promise<void>;
  /** Pick the session back up after a restart. Signs out if the tokens are gone or rejected. */
  restoreSession: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  verifyResetCode: (code: string) => Promise<void>;
  resetPassword: (password: string) => Promise<void>;
  completeOnboarding: (nickname: string) => void;
  updateProfile: (patch: Partial<Pick<User, 'name' | 'email' | 'avatarUri'>>) => void;
  signOut: () => Promise<void>;
};

const MOCK_LATENCY_MS = 600;
const DEMO_USER: User = {
  id: 'user_demo',
  name: 'Rophy Alade',
  nickname: 'Rophy',
  email: 'aladexrofiah@gmail.com',
};

type SetAuth = (partial: Partial<AuthState>) => void;

/** Everything cached on the phone belongs to one account, so wipe it between accounts. */
function clearLocalData() {
  useHabitsStore.getState().clear();
  useTasksStore.getState().clear();
  useNotificationsStore.getState().clear();
  useChatStore.getState().clear();
  usePreferencesStore.getState().reset();
  useOnboardingStore.getState().reset();
}

/** Load the signed-in account and decide where it goes next: onboarding or the app. */
async function loadAccount(set: SetAuth) {
  const [account, onboarding] = await Promise.all([profileApi.get(), profileApi.getOnboarding()]);
  set({
    status: onboarding.completed ? 'ready' : 'onboarding',
    user: fromApi(account, onboarding.name ?? undefined),
    pendingEmail: null,
  });
  // Bring the account's habits and tasks along. A hiccup here must not block signing in:
  // the screens simply show what the phone already has.
  await syncData().catch(() => undefined);
}

/**
 * The session. With `EXPO_PUBLIC_API_URL` set it talks to the backend; without it (demo mode)
 * it is static: no network, and every method takes a beat so screens show their loading states.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      status: 'signedOut',
      user: null,
      pendingEmail: null,
      hasSeenIntro: false,

      markIntroSeen: () => set({ hasSeenIntro: true }),

      resetCode: null,

      signIn: async (email, password) => {
        if (!DEMO_MODE) {
          try {
            await authApi.logIn({ email: email.trim(), password });
          } catch (e) {
            if (e instanceof ApiError && e.status === 403) {
              // Signed up but never confirmed the email: send them to finish that.
              set({ status: 'unverified', pendingEmail: email.trim() });
              await authApi.resendCode(email.trim()).catch(() => undefined);
            }
            throw authError(e);
          }
          await loadAccount(set);
          return;
        }
        await sleep(MOCK_LATENCY_MS);
        // The only account the static build "knows": a wrong password for it is an error.
        if (email && sameEmail(email, DEMO_EMAIL) && password !== DEMO_PASSWORD) {
          throw new AuthError('Incorrect email or password. Check them and try again.');
        }
        useHabitsStore.getState().seedDemo();
        useTasksStore.getState().seedDemo();
        useNotificationsStore.getState().seedDemo();
        useChatStore.getState().seedDemo();
        set({ status: 'ready', user: { ...DEMO_USER, email: email.trim() || DEMO_USER.email } });
      },

      signUp: async (name, email, password) => {
        if (!DEMO_MODE) {
          try {
            const created = await authApi.signUp({
              name: name.trim(),
              email: email.trim(),
              password,
              timezone: deviceTimeZone(),
            });
            clearLocalData();
            set({ status: 'unverified', user: fromApi(created), pendingEmail: email.trim() });
          } catch (e) {
            throw authError(e, 'email');
          }
          return;
        }
        await sleep(MOCK_LATENCY_MS);
        if (sameEmail(email, DEMO_EMAIL)) {
          throw new AuthError(
            'An account with this email already exists. Try logging in instead.',
            'email'
          );
        }
        clearLocalData();
        set({
          status: 'unverified',
          user: { id: 'user_new', name: name.trim(), email: email.trim() },
          pendingEmail: email.trim(),
        });
      },

      verifyEmail: async (code) => {
        if (!DEMO_MODE) {
          const email = get().pendingEmail ?? get().user?.email ?? '';
          try {
            await authApi.verifyEmail({ email, code });
          } catch (e) {
            throw authError(e, 'code');
          }
          await loadAccount(set);
          return;
        }
        await sleep(MOCK_LATENCY_MS);
        if (code !== DEMO_CODE) {
          throw new AuthError('That code isn’t right. Check it and try again.', 'code');
        }
        set({ status: 'onboarding' });
      },

      resendCode: async () => {
        if (DEMO_MODE) return;
        const email = get().pendingEmail ?? get().user?.email ?? '';
        try {
          await authApi.resendCode(email);
        } catch (e) {
          throw authError(e);
        }
      },

      restoreSession: async () => {
        if (DEMO_MODE) return;
        const { status } = get();
        if (status === 'signedOut' || status === 'unverified') return;
        if (!(await getTokens())) {
          set({ status: 'signedOut', user: null });
          return;
        }
        try {
          await loadAccount(set);
        } catch (e) {
          // Offline at launch: keep what we saved and let the app work from it.
          if (!(e instanceof ApiError) || !e.isNetwork) set({ status: 'signedOut', user: null });
        }
      },

      requestPasswordReset: async (email) => {
        if (!DEMO_MODE) {
          try {
            await authApi.forgotPassword(email.trim());
          } catch (e) {
            throw authError(e, 'email');
          }
          set({ pendingEmail: email.trim(), resetCode: null });
          return;
        }
        await sleep(MOCK_LATENCY_MS);
        set({ pendingEmail: email.trim() });
      },

      verifyResetCode: async (code) => {
        if (!DEMO_MODE) {
          try {
            await authApi.verifyReset({ email: get().pendingEmail ?? '', code });
          } catch (e) {
            throw authError(e, 'code');
          }
          set({ resetCode: code });
          return;
        }
        await sleep(MOCK_LATENCY_MS);
        if (code !== DEMO_CODE) {
          throw new AuthError('That code isn’t right. Check it and try again.', 'code');
        }
        set({ resetCode: code });
      },

      resetPassword: async (password) => {
        if (!DEMO_MODE) {
          try {
            await authApi.resetPassword({
              email: get().pendingEmail ?? '',
              code: get().resetCode ?? '',
              new_password: password,
            });
          } catch (e) {
            throw authError(e, 'password');
          }
          set({ pendingEmail: null, resetCode: null });
          return;
        }
        await sleep(MOCK_LATENCY_MS);
        set({ pendingEmail: null, resetCode: null });
      },

      completeOnboarding: (nickname) => {
        const { user } = get();
        set({
          status: 'ready',
          user: user ? { ...user, nickname: nickname.trim() || user.nickname } : user,
        });
        if (DEMO_MODE) return;
        const answers = useOnboardingStore.getState();
        void profileApi
          .saveOnboarding({
            name: nickname.trim() || undefined,
            wake_time: (answers.wakeTime && WAKE_TIMES[answers.wakeTime]) || undefined,
            sleep_time: (answers.sleepTime && SLEEP_TIMES[answers.sleepTime]) || undefined,
            goals: answers.goals,
            nudge_style: answers.tone ?? undefined,
            completed: true,
          })
          .catch(() =>
            toast.show('Couldn’t save your answers yet. We’ll keep them on this phone.')
          );
      },

      updateProfile: (patch) => set((s) => (s.user ? { user: { ...s.user, ...patch } } : s)),

      signOut: async () => {
        if (!DEMO_MODE) await authApi.logOut();
        clearLocalData();
        set({ status: 'signedOut', user: null, pendingEmail: null, resetCode: null });
      },
    }),
    {
      name: 'nudge.auth',
      version: STORE_VERSION,
      storage: persistStorage,
      partialize: (s) => ({
        status: s.status,
        user: s.user,
        pendingEmail: s.pendingEmail,
        hasSeenIntro: s.hasSeenIntro,
      }),
    }
  )
);

// A refresh the server rejected means the session is over: drop back to the sign-in screens.
onSessionExpired(() => {
  clearLocalData();
  useAuthStore.setState({ status: 'signedOut', user: null, pendingEmail: null, resetCode: null });
});
