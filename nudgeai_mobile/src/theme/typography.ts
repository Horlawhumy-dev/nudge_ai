import type { TextStyle } from 'react-native';

import { fonts } from './fonts';

export type TextVariant =
  | 'hero'
  | 'title'
  | 'heading'
  | 'numeral'
  | 'subheading'
  | 'bodyLarge'
  | 'body'
  | 'bodyMedium'
  | 'label'
  | 'caption'
  | 'button';

/** Playfair defaults to old-style figures; the design uses lining ones. */
const lining: Pick<TextStyle, 'fontVariant'> = { fontVariant: ['lining-nums'] };

/** Sizes are in points on the 390pt-wide design grid. */
export const typography: Record<TextVariant, TextStyle> = {
  /** Intro slide headlines. */
  hero: { fontFamily: fonts.displayBold, fontSize: 32, lineHeight: 46, ...lining },
  /** Screen titles ("Welcome Back!", "My Habits"). */
  title: { fontFamily: fonts.display, fontSize: 26, lineHeight: 35, ...lining },
  heading: { fontFamily: fonts.display, fontSize: 20, lineHeight: 28, ...lining },
  /** Stat figures such as "92%" and "18/25". */
  numeral: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, ...lining },
  subheading: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 22 },
  bodyLarge: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  bodyMedium: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  button: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 22 },
};
