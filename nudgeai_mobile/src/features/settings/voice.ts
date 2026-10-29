import type { ToneId } from '@/features/onboarding/data';

/** How each tone should sound: calm and warm, brisk and direct, or in between. */
const DELIVERY: Record<ToneId, { rate: number; pitch: number }> = {
  gentle: { rate: 0.92, pitch: 1.05 },
  firm: { rate: 1.08, pitch: 0.9 },
  mix: { rate: 1, pitch: 1 },
};

export function deliveryFor(tone: ToneId): { rate: number; pitch: number } {
  return DELIVERY[tone] ?? DELIVERY.mix;
}

/**
 * The sample line as it should be read aloud: no quotation marks around it, and a spaced dash
 * ("You're on a roll - keep it going") becomes a pause instead of the word "minus" or silence.
 */
export function spokenText(quote: string): string {
  return quote
    .replace(/[“”"]/g, '')
    .replace(/\s[-–—]\s/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}
