import { api, saveSession } from '../client';
import { clearTokens, getTokens } from '../tokens';
import type { ApiUser, MessageResponse, TokenResponse } from '../types';

export const authApi = {
  async signUp(body: { email: string; password: string; name: string; timezone: string }) {
    const { data } = await api.post<ApiUser>('/auth/signup', body);
    return data;
  },

  /** Confirms the emailed code and signs the user in (the reply carries the tokens). */
  async verifyEmail(body: { email: string; code: string }) {
    const { data } = await api.post<TokenResponse>('/auth/verify-email', body);
    await saveSession(data);
  },

  async resendCode(email: string) {
    await api.post<MessageResponse>('/auth/resend-code', { email });
  },

  async logIn(body: { email: string; password: string }) {
    const { data } = await api.post<TokenResponse>('/auth/login', body);
    await saveSession(data);
  },

  /** Ends the session on the server too; local tokens are cleared whatever happens. */
  async logOut() {
    const tokens = await getTokens();
    try {
      if (tokens) await api.post('/auth/logout', { refresh_token: tokens.refreshToken });
    } catch {
      // Offline or already expired: the local sign-out below is what matters.
    } finally {
      await clearTokens();
    }
  },

  async forgotPassword(email: string) {
    await api.post<MessageResponse>('/auth/forgot-password', { email });
  },

  /** Checks the reset code without using it; the same code is sent again by `resetPassword`. */
  async verifyReset(body: { email: string; code: string }) {
    await api.post<MessageResponse>('/auth/verify-reset', body);
  },

  async resetPassword(body: { email: string; code: string; new_password: string }) {
    await api.post<MessageResponse>('/auth/reset-password', body);
  },

  async changePassword(body: { current_password: string; new_password: string }) {
    const { data } = await api.post<TokenResponse>('/auth/change-password', body);
    await saveSession(data); // other sessions were signed out; keep this one on the new pair
  },

  async deleteAccount(password: string) {
    await api.post('/auth/delete-account', { password });
    await clearTokens();
  },
};
