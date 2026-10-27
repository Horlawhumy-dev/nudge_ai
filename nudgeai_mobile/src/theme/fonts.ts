/**
 * Font family names as registered by `useAppFonts`. Playfair Display carries headings
 * and numerals; Inter carries everything else.
 */
export const fonts = {
  display: 'PlayfairDisplay_600SemiBold',
  displayBold: 'PlayfairDisplay_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
} as const;

export type FontFamily = (typeof fonts)[keyof typeof fonts];

export const fontAssets: Record<FontFamily, number> = {
  [fonts.display]: require('@expo-google-fonts/playfair-display/600SemiBold/PlayfairDisplay_600SemiBold.ttf'),
  [fonts.displayBold]: require('@expo-google-fonts/playfair-display/700Bold/PlayfairDisplay_700Bold.ttf'),
  [fonts.body]: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
  [fonts.bodyMedium]: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
  [fonts.bodySemiBold]: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
};
