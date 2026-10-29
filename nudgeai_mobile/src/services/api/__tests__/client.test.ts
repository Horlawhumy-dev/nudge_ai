import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';

import { createClient } from '../client';
import { ApiError } from '../errors';
import * as tokens from '../tokens';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

const BASE = 'http://api.test/v1';

/** Replies by looking at the Authorization header: only the "fresh" token is accepted. */
function server(accepted: string, calls: string[] = []): AxiosAdapter {
  return async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const auth = String(config.headers.get('Authorization') ?? '');
    calls.push(`${config.method} ${config.url} ${auth}`);
    const ok = auth === `Bearer ${accepted}`;
    const response = { data: ok ? { ok: true } : { detail: 'expired' }, status: ok ? 200 : 401 };
    const full = { ...response, statusText: '', headers: {}, config } as AxiosResponse;
    if (ok) return full;
    throw Object.assign(new Error('401'), { response: full, config, isAxiosError: true });
  };
}

beforeEach(async () => {
  jest.restoreAllMocks();
  tokens.resetTokenCache();
  await tokens.setTokens({ accessToken: 'old', refreshToken: 'r1' });
});

describe('api client', () => {
  it('attaches the access token to requests', async () => {
    const calls: string[] = [];
    const client = createClient(BASE);
    client.defaults.adapter = server('old', calls);
    await client.get('/habits');
    expect(calls).toEqual(['get /habits Bearer old']);
  });

  it('skips ngrok’s browser warning page, which would otherwise swallow web requests', async () => {
    const seen: string[] = [];
    const client = createClient(BASE);
    client.defaults.adapter = async (
      config: InternalAxiosRequestConfig
    ): Promise<AxiosResponse> => {
      seen.push(String(config.headers.get('ngrok-skip-browser-warning')));
      return { data: {}, status: 200, statusText: '', headers: {}, config } as AxiosResponse;
    };
    await client.get('/habits');
    expect(seen).toEqual(['1']);
  });

  it('refreshes an expired token once and retries', async () => {
    const calls: string[] = [];
    const client = createClient(BASE);
    client.defaults.adapter = server('fresh', calls);
    const post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'fresh', refresh_token: 'r2', token_type: 'bearer', expires_in: 1800 },
    });

    const res = await client.get('/habits');

    expect(res.data).toEqual({ ok: true });
    expect(post).toHaveBeenCalledWith(
      `${BASE}/auth/refresh`,
      { refresh_token: 'r1' },
      expect.anything()
    );
    expect(calls).toEqual(['get /habits Bearer old', 'get /habits Bearer fresh']);
    expect(await tokens.getTokens()).toEqual({ accessToken: 'fresh', refreshToken: 'r2' });
  });

  it('shares one refresh between simultaneous requests (tokens rotate)', async () => {
    const client = createClient(BASE);
    client.defaults.adapter = server('fresh');
    const post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'fresh', refresh_token: 'r2', token_type: 'bearer', expires_in: 1800 },
    });
    await Promise.all([client.get('/habits'), client.get('/tasks'), client.get('/streak')]);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('ends the session when the refresh is rejected', async () => {
    const client = createClient(BASE);
    client.defaults.adapter = server('never');
    jest.spyOn(axios, 'post').mockRejectedValue({ response: { status: 401, data: {} } });
    const expired = jest.fn();
    const off = tokens.onSessionExpired(expired);

    await expect(client.get('/habits')).rejects.toBeInstanceOf(ApiError);

    expect(expired).toHaveBeenCalledTimes(1);
    expect(await tokens.getTokens()).toBeNull();
    off();
  });

  it('keeps the session when the refresh fails only because the phone is offline', async () => {
    const client = createClient(BASE);
    client.defaults.adapter = server('never');
    jest.spyOn(axios, 'post').mockRejectedValue(new Error('Network Error'));
    const expired = jest.fn();
    const off = tokens.onSessionExpired(expired);

    await expect(client.get('/habits')).rejects.toMatchObject({ status: 401 });

    expect(expired).not.toHaveBeenCalled();
    expect(await tokens.getTokens()).not.toBeNull();
    off();
  });

  it('does not try to refresh a failed login', async () => {
    const client = createClient(BASE);
    client.defaults.adapter = server('never');
    const post = jest.spyOn(axios, 'post');
    await expect(client.post('/auth/login', {})).rejects.toBeInstanceOf(ApiError);
    expect(post).not.toHaveBeenCalled();
  });
});
