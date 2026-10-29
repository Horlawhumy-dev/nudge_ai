import { FIRST_CHUNK_MIN, SentenceBuffer } from '../sentences';

/** Feed text the way a model delivers it: a few characters at a time. */
function stream(text: string, size = 3): string[] {
  const buffer = new SentenceBuffer();
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(...buffer.push(text.slice(i, i + size)));
  const rest = buffer.flush();
  if (rest) out.push(rest);
  return out;
}

describe('SentenceBuffer', () => {
  it('releases a sentence once the next one has begun, not before', () => {
    const b = new SentenceBuffer();
    expect(b.push('Okay, I have added your dentist visit for tomorrow.')).toEqual([]); // might go on
    expect(b.push(' ')).toEqual([]);
    expect(b.push('I')).toEqual(['Okay, I have added your dentist visit for tomorrow.']);
  });

  it('gives back everything, in order, however the text is cut into pieces', () => {
    const text =
      'Okay, I have added your dentist visit for tomorrow. I will remind you ten minutes before it starts, so you are ready in time. Anything else?';
    const original = text.replace(/\s+/g, ' ');
    for (const size of [1, 2, 5, 17, 200]) {
      expect(stream(text, size).join(' ').replace(/\s+/g, ' ')).toBe(original);
    }
  });

  it('merges a tiny first sentence into the next so the voice is not clipped', () => {
    const chunks = stream(
      'Done. I added the task for tomorrow at 3 pm and will remind you before.'
    );
    expect(chunks[0].length).toBeGreaterThanOrEqual(FIRST_CHUNK_MIN);
    expect(chunks[0].startsWith('Done. I added')).toBe(true);
  });

  it('lets the first chunk be short, but makes later ones longer', () => {
    const text =
      'Sure thing, Ada, I can do that now. ' +
      'First sentence of the second part. Second sentence of the second part. ' +
      'Third sentence of the second part here. And a final little one.';
    const chunks = stream(text);
    expect(chunks[0]).toBe('Sure thing, Ada, I can do that now.');
    expect(chunks[1].length).toBeGreaterThanOrEqual(50);
  });

  it('does not split decimals, times or abbreviations', () => {
    expect(
      stream('It costs 3.50 today and the meeting is at 3 p.m. tomorrow with Dr. Smith.')
    ).toEqual(['It costs 3.50 today and the meeting is at 3 p.m. tomorrow with Dr. Smith.']);
  });

  it('treats a question or exclamation as an ending, and keeps closing quotes with it', () => {
    const chunks = stream(
      'You said "let us go!" Great, let me set that up for you right away. Ready?'
    );
    expect(chunks[0]).toBe('You said "let us go!" Great, let me set that up for you right away.');
  });

  it('treats a line break as an ending, so list items are spoken one at a time', () => {
    const chunks = stream(
      '- Drink a glass of water first thing\n- Stretch for five minutes by the window\n- Plan your top three tasks'
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(' ')).toContain('Plan your top three tasks');
  });

  it('flushes a reply that never ends with a full stop', () => {
    const b = new SentenceBuffer();
    expect(b.push('Sounds good to me')).toEqual([]);
    expect(b.flush()).toBe('Sounds good to me');
    expect(b.flush()).toBe(''); // and nothing twice
  });

  it('copes with empty and whitespace-only input', () => {
    const b = new SentenceBuffer();
    expect(b.push('')).toEqual([]);
    expect(b.push('   ')).toEqual([]);
    expect(b.flush()).toBe('');
  });
});
