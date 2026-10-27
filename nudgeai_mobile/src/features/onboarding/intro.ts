export type IntroSlide = {
  id: 'alarm' | 'rhythm' | 'streak';
  title: string[];
  body: string;
};

export const INTRO_SLIDES: readonly IntroSlide[] = [
  {
    id: 'alarm',
    title: ['Alarms startle.', 'We speak.'],
    body: 'Nudge sends warm, voice-powered reminders—like a friend checking in.',
  },
  {
    id: 'rhythm',
    title: ['AI that learns', 'your rhythm.'],
    body: 'Nudge learns your schedule and habits—then delivers perfectly timed reminders in your tone, with your name.',
  },
  {
    id: 'streak',
    title: ['Small Nudges.', 'Big Streaks.'],
    body: 'Track every habit, celebrate every win. Nudge keeps you consistent without guilt.',
  },
];
