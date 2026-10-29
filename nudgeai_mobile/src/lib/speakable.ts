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

/** The first chunk is meant to reach the ear quickly; this is about two short sentences. */
const FIRST_CHUNK_MIN = 40;
const FIRST_CHUNK_MAX = 140;

/**
 * Split text for spoken playback into a short first chunk and the rest. Both are fetched at the
 * same time, but the first is small, so it comes back (and starts playing) much sooner than the
 * whole reply would. Returns one chunk when the text is already short or has no sentence end.
 */
export function splitForSpeech(text: string): string[] {
  const clean = text.trim();
  if (clean.length <= FIRST_CHUNK_MAX) return clean ? [clean] : [];

  // Take whole sentences until the first chunk is long enough to sound natural on its own.
  const ends = [...clean.matchAll(/[.!?](?=\s|$)/g)].map((m) => (m.index ?? 0) + 1);
  let cut = 0;
  for (const end of ends) {
    if (end > FIRST_CHUNK_MAX) break;
    cut = end;
    if (end >= FIRST_CHUNK_MIN) break;
  }
  if (cut === 0 || cut >= clean.length) return [clean];
  return [clean.slice(0, cut).trim(), clean.slice(cut).trim()].filter(Boolean);
}
