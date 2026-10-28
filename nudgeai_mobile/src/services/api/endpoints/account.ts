import { Platform } from 'react-native';

import { api } from '../client';

export type FeedbackCategory = 'bug' | 'idea' | 'praise' | 'other' | 'rating';

export type ApiSubscription = {
  plan: 'free' | 'pro';
  period: 'monthly' | 'yearly' | null;
  status: string;
};

export const accountApi = {
  async sendFeedback(body: {
    category: FeedbackCategory;
    message?: string;
    stars?: number;
    appVersion?: string;
  }) {
    await api.post('/feedback', {
      category: body.category,
      message: body.message,
      stars: body.stars,
      app_version: body.appVersion,
      platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
    });
  },

  /** Everything the account holds, as JSON. */
  async exportData() {
    const { data } = await api.get<Record<string, unknown>>('/account/export');
    return data;
  },

  async changePlan(plan: 'free' | 'pro', period: 'monthly' | 'yearly') {
    const { data } = await api.put<ApiSubscription>('/subscription', { plan, period });
    return data;
  },
};
