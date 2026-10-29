/**
 * Cuts text that arrives in pieces ("Hi", " there", "! How", ...) into chunks worth speaking.
 *
 * A sentence is only closed once the text after its full stop has started to arrive, because a
 * full stop is not always an ending ("3.50", "3 p.m. tomorrow", "Dr. Smith"). Tiny sentences like
 * "Done." are merged with the next one so the voice doesn't speak in clipped fragments. The first
 * chunk is allowed to be short, because it is the one the listener is waiting for.
 */

const ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'st',
  'vs',
  'etc',
  'e.g',
  'i.e',
  'a.m',
  'p.m',
]);

export const FIRST_CHUNK_MIN = 25;
export const NEXT_CHUNK_MIN = 50;

/** Index just after the end of the first complete sentence in `text`, or -1 if none is closed. */
function sentenceEnd(text: string): number {
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\n') {
      // A line break closes a line, but only once something follows it (list items, paragraphs).
      if (text.slice(i + 1).trim()) return i + 1;
      continue;
    }
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;
    // Swallow closing quotes and brackets: `said "Go."` ends after the quote.
    let end = i + 1;
    while (end < text.length && /["')\]*_]/.test(text[end])) end += 1;
    // Needs whitespace, then the first character of what follows, before we can be sure.
    const rest = text.slice(end);
    const gap = /^\s+/.exec(rest);
    if (!gap) continue; // "3.50", "end.Next", or the text just stopped here: not an ending (yet)
    const next = rest[gap[0].length];
    if (next === undefined) continue; // wait for the next piece to see what comes after
    if (ch === '.') {
      const word = /([A-Za-z.]+)$/.exec(text.slice(0, i))?.[1]?.toLowerCase() ?? '';
      if (ABBREVIATIONS.has(word)) continue;
      if (/[a-z]/.test(next)) continue; // "3 p.m. tomorrow": a lower-case word continues the sentence
    }
    return end + gap[0].length;
  }
  return -1;
}

export class SentenceBuffer {
  private pending = '';
  private building = '';
  private emitted = 0;

  /** Add a piece; returns any chunks that are now complete (usually none, sometimes one). */
  push(piece: string): string[] {
    this.pending += piece;
    const out: string[] = [];
    for (;;) {
      const end = sentenceEnd(this.pending);
      if (end < 0) break;
      this.building += this.pending.slice(0, end);
      this.pending = this.pending.slice(end);
      const chunk = this.takeIfLongEnough();
      if (chunk) out.push(chunk);
    }
    return out;
  }

  /** The text is over: whatever is left, as a final chunk (or '' if nothing is). */
  flush(): string {
    const rest = `${this.building}${this.pending}`.trim();
    this.building = '';
    this.pending = '';
    if (rest) this.emitted += 1;
    return rest;
  }

  private takeIfLongEnough(): string {
    const min = this.emitted === 0 ? FIRST_CHUNK_MIN : NEXT_CHUNK_MIN;
    if (this.building.trim().length < min) return '';
    const chunk = this.building.trim();
    this.building = '';
    this.emitted += 1;
    return chunk;
  }
}
