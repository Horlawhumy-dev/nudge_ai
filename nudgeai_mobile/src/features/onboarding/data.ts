export type TimeOption = { id: string; label: string; emoji: string };

export const WAKE_OPTIONS: readonly TimeOption[] = [
  { id: 'before-6', label: 'Before 6:00 am', emoji: '🌙' },
  { id: '6-7', label: '6:00 am  -  7:00 am', emoji: '🌅' },
  { id: '7-8', label: '7:00 am  -  8:00 am', emoji: '🌞' },
  { id: 'after-8', label: 'After 8:00 am', emoji: '⛅' },
];

export const SLEEP_OPTIONS: readonly TimeOption[] = [
  { id: 'before-9', label: 'Before 9:00 pm', emoji: '🌃' },
  { id: '9-1030', label: '9:00 pm  -  10:30 pm', emoji: '🌙' },
  { id: '1030-12', label: '10:30 pm  -  12:00 am', emoji: '🌛' },
  { id: 'after-midnight', label: 'After midnight', emoji: '🌆' },
];

/** The clock time each answer stands for, as the backend stores it (24 h `HH:MM`). */
export const WAKE_TIMES: Record<string, string> = {
  'before-6': '05:30',
  '6-7': '06:30',
  '7-8': '07:30',
  'after-8': '08:30',
};

export const SLEEP_TIMES: Record<string, string> = {
  'before-9': '20:30',
  '9-1030': '22:00',
  '1030-12': '23:15',
  'after-midnight': '00:30',
};

export type Goal = { id: string; label: string; emoji: string };

export const GOALS: readonly Goal[] = [
  { id: 'fitness', label: 'Fitness', emoji: '💪' },
  { id: 'reading', label: 'Reading', emoji: '📚' },
  { id: 'deep-work', label: 'Deep work', emoji: '🧠' },
  { id: 'hydration', label: 'Hydration', emoji: '💧' },
  { id: 'mindfulness', label: 'Mindfulness', emoji: '🧘' },
  { id: 'sleep', label: 'Sleep', emoji: '😴' },
  { id: 'journaling', label: 'Journaling', emoji: '✍️' },
  { id: 'focus', label: 'Focus', emoji: '🎯' },
  { id: 'nutrition', label: 'Nutrition', emoji: '🍎' },
  { id: 'work-task', label: 'Work task', emoji: '💼' },
];

export type ToneId = 'gentle' | 'firm' | 'mix';

export type ToneOption = {
  id: ToneId;
  title: string;
  emoji: string;
  /** Short line shown on the onboarding card. */
  sample: (name: string) => string;
  /** Longer description shown in AI voice & tone settings. */
  description: string;
};

export const TONES: readonly ToneOption[] = [
  {
    id: 'gentle',
    title: 'Gentle & Warm',
    emoji: '🤝',
    sample: (name) => `“Hey ${name}, ready when you are.”`,
    description: 'Soft, friendly nudges that feel like a check-in from a friend.',
  },
  {
    id: 'firm',
    title: 'Firm & Motivating',
    emoji: '⚡',
    sample: (name) => `“${name}. Workout. Now. Let’s go.”`,
    description: 'Direct, energetic reminders that push you to act now.',
  },
  {
    id: 'mix',
    title: 'Mix it up',
    emoji: '🎲',
    sample: () => '“Could be either - Nudge decides.”',
    description: 'AI picks the mood based on your day.',
  },
];

export const ONBOARDING_STEPS = 5;
