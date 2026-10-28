import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

import { API_URL } from '@/constants/env';

import { toApiError } from './errors';
import { clearTokens, getTokens, notifySessionExpired, setTokens } from './tokens';
import type { TokenResponse } from './types';

const TIMEOUT_MS = 20_000;

/** Calls that must never trigger a refresh: they are how a session starts or ends. */
const NO_REFRESH = ['/auth/login', '/auth/signup', '/auth/refresh', '/auth/verify-email'];

type Retriable = InternalAxiosRequestConfig & { _retried?: boolean };

export function createClient(baseURL = API_URL): AxiosInstance {
  // eslint-disable-next-line import/no-named-as-default-member
  const instance = axios.create({ baseURL, timeout: TIMEOUT_MS });

  instance.interceptors.request.use(async (config) => {
    const tokens = await getTokens();
    if (tokens && !config.headers.has('Authorization')) {
      config.headers.set('Authorization', `Bearer ${tokens.accessToken}`);
    }
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as Retriable | undefined;
      const skip = !config || NO_REFRESH.some((p) => config.url?.startsWith(p));
      if (error.response?.status === 401 && config && !skip && !config._retried) {
        config._retried = true;
        const fresh = await refreshOnce(baseURL);
        if (fresh) {
          config.headers.set('Authorization', `Bearer ${fresh}`);
          return instance.request(config);
        }
      }
      throw toApiError(error);
    }
  );

  return instance;
}

let inflight: Promise<string | null> | null = null;

/**
 * Swap the refresh token for a new pair. Refresh tokens rotate (the old one dies on use), so
 * concurrent 401s must share one refresh or all but the first would sign the user out.
 */
function refreshOnce(baseURL: string): Promise<string | null> {
  inflight ??= (async () => {
    const tokens = await getTokens();
    if (!tokens) return null;
    try {
      // A bare axios call: going through the client would loop on its own 401 handling.
      const { data } = await axios.post<TokenResponse>(
        `${baseURL}/auth/refresh`,
        { refresh_token: tokens.refreshToken },
        { timeout: TIMEOUT_MS }
      );
      await setTokens({ accessToken: data.access_token, refreshToken: data.refresh_token });
      return data.access_token;
    } catch (e) {
      // Only a real rejection ends the session; being offline just fails this one request.
      if ((e as AxiosError).response) {
        await clearTokens();
        notifySessionExpired();
      }
      return null;
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** The app-wide client. */
export const api = createClient();

export async function saveSession(tokens: TokenResponse): Promise<void> {
  await setTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
}
