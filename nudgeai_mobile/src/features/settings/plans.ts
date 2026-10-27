export type Billing = 'monthly' | 'yearly';

type Pricing = { price: string; period: string };

export const PLANS = {
  free: {
    name: 'Free',
    tagline: 'Always free',
    features: [
      'Create up to 3 habits',
      'Create up to 5 daily tasks',
      'Basic text notifications only',
      'All priority levels',
      '7-day streak tracking',
    ],
  },
  pro: {
    name: 'Nudge Pro',
    tagline: 'Your habits deserve more',
    monthly: { price: '$4.99', period: '/ month' } satisfies Pricing,
    yearly: { price: '$49.99', period: '/ year' } satisfies Pricing,
    features: [
      'Unlimited habits and tasks',
      'All priority levels',
      'AI voice reminders',
      'Habit stacking feature',
      'AI insights and weekly reports',
      'Custom reminder tone and voice style',
    ],
  },
} as const;
