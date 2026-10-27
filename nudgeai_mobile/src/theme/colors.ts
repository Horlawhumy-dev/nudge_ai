import { palette } from './palette';

/** Semantic colour tokens. Light theme only for now (see README, build step 10). */
export const colors = {
  background: palette.gray50,
  /** Auth and onboarding screens sit on near-white rather than the app grey. */
  backgroundAuth: palette.paper,
  surface: palette.white,
  surfaceMuted: palette.gray75,
  fill: palette.gray100,
  fillDisabled: palette.gray150,

  border: palette.gray300,
  borderSoft: palette.gray150,
  track: palette.gray150,

  text: palette.ink,
  textSecondary: palette.gray700,
  textMuted: palette.gray500,
  textPlaceholder: palette.gray500,
  textDisabled: palette.gray400,
  textOnPrimary: palette.white,
  textOnInverse: palette.white,

  primary: palette.purple,
  primaryTint: palette.purpleTint,
  primarySoft: palette.purpleSoft,
  primaryPressed: palette.purpleDeep,

  inverse: palette.ink,

  danger: palette.red,
  dangerSoft: palette.redSoft,
  success: palette.green,

  overlay: 'rgba(0,0,0,0.4)',

  /** Habit progress accents, cycled by habit order. */
  accents: [palette.pink, palette.blue, palette.salmon, palette.amber],

  /** Onboarding intro backdrops. */
  intro: {
    alarm: palette.purpleTint,
    rhythm: palette.pink,
    streak: palette.blue,
  },
} as const;

export const gradients = {
  /** Nudge AI banner and Pro upsell card. */
  ai: ['#EDD2FF', '#C15EFF'] as const,
  aiStart: { x: 0, y: 0.5 },
  aiEnd: { x: 0.65, y: 0.5 },
  voiceDock: ['rgba(237,208,255,0)', '#EDD0FF'] as const,
};
