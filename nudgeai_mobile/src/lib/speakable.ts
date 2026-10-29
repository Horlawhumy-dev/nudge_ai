import { plainText } from '@/features/chat/markdown';

/** Long enough for a reply's point, short enough to start quickly and not burn voice quota. */
export const MAX_SPOKEN_CHARS = 280;

/**
 * What to read aloud for a reply: the text without formatting characters (no "star star"),
 * cut at a sentence boundary when it runs long.
 */
export function speakableText(markdown: string, max: number = MAX_SPOKEN_CHARS): string {
  const text = plainText(markdown).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const sentenceEnd = Math.max(
    head.lastIndexOf('. '),
    head.lastIndexOf('! '),
    head.lastIndexOf('? ')
  );
  if (sentenceEnd > max * 0.4) return head.slice(0, sentenceEnd + 1);
  const space = head.lastIndexOf(' ');
  return (space > 0 ? head.slice(0, space) : head).trim();
}
