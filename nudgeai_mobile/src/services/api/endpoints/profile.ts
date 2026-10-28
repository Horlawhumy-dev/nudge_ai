import { api } from '../client';
import type { ApiOnboarding, ApiUser } from '../types';

export const profileApi = {
  async get() {
    const { data } = await api.get<ApiUser>('/profile');
    return data;
  },

  async update(body: { name?: string; timezone?: string }) {
    const { data } = await api.patch<ApiUser>('/profile', body);
    return data;
  },

  async getOnboarding() {
    const { data } = await api.get<ApiOnboarding>('/onboarding');
    return data;
  },

  async saveOnboarding(body: Partial<ApiOnboarding>) {
    const { data } = await api.patch<ApiOnboarding>('/onboarding', body);
    return data;
  },
};
