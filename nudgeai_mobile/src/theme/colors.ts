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
  white: palette.white,
  pink: palette.pink,

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
  /** Light lavender under the orb fading to full purple; for banners that start with an icon. */
  banner: ['#EDD2FF', '#C15EFF', '#B650FA'] as const,
  bannerLocations: [0, 0.34, 1] as const,
  /** Deeper fill for cards whose text starts at the left edge (e.g. "Preview your Nudge"). */
  card: ['#D08CFF', '#B650FA'] as const,
  start: { x: 0, y: 0.5 },
  end: { x: 1, y: 0.5 },
  voiceDock: ['rgba(237,208,255,0)', '#EDD0FF'] as const,
};
