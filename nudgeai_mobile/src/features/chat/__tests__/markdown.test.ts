import { parseInline, parseMarkdown, plainText, type Inline } from '../markdown';

const text = (t: string): Inline => ({ type: 'text', text: t });

describe('inline formatting', () => {
  it('reads bold, italic and code', () => {
    expect(parseInline('Do **deep work** at *10am* with `focus`')).toEqual([
      text('Do '),
      { type: 'bold', children: [text('deep work')] },
      text(' at '),
      { type: 'italic', children: [text('10am')] },
      text(' with '),
      { type: 'code', text: 'focus' },
    ]);
  });

  it('nests italic inside bold', () => {
    expect(parseInline('**very *calm* day**')).toEqual([
      {
        type: 'bold',
        children: [text('very '), { type: 'italic', children: [text('calm')] }, text(' day')],
      },
    ]);
  });

  it('leaves characters that are not formatting exactly as written', () => {
    expect(parseInline('5 * 3 = 15')).toEqual([text('5 * 3 = 15')]);
    expect(parseInline('use snake_case_names here')).toEqual([text('use snake_case_names here')]);
    expect(parseInline('an unclosed **bold')).toEqual([text('an unclosed **bold')]);
    expect(parseInline('a lone * star')).toEqual([text('a lone * star')]);
    expect(parseInline('** **')).toEqual([text('** **')]);
  });

  it('reads underscores as emphasis only at word edges', () => {
    expect(parseInline('this is _really_ good')).toEqual([
      text('this is '),
      { type: 'italic', children: [text('really')] },
      text(' good'),
    ]);
    expect(parseInline('__Heads up__ now')).toEqual([
      { type: 'bold', children: [text('Heads up')] },
      text(' now'),
    ]);
  });

  it('turns http links into links and ignores other schemes', () => {
    expect(parseInline('see [the guide](https://example.com/a?b=1) now')).toEqual([
      text('see '),
      { type: 'link', label: 'the guide', url: 'https://example.com/a?b=1' },
      text(' now'),
    ]);
    expect(parseInline('[tap](javascript:alert(1))')).toEqual([text('[tap](javascript:alert(1))')]);
  });

  it('keeps emoji and non-Latin text intact', () => {
    expect(parseInline('Great job 🎉 **Ṣé dáadáa**')).toEqual([
      text('Great job 🎉 '),
      { type: 'bold', children: [text('Ṣé dáadáa')] },
    ]);
  });
});

describe('blocks', () => {
  it('turns dash, star and dot bullets into list items', () => {
    const blocks = parseMarkdown(
      'Try these:\n- Drink water\n* Stretch for **5 mins**\n• Plan tomorrow'
    );
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'bullet', 'bullet', 'bullet']);
    expect(plainText('- a\n* b\n• c')).toBe('a\nb\nc');
  });

  it('numbers ordered lists and keeps the numbers the model wrote', () => {
    const blocks = parseMarkdown('1. Wake up\n2) Walk\n10. Write');
    expect(blocks).toMatchObject([
      { type: 'ordered', number: 1 },
      { type: 'ordered', number: 2 },
      { type: 'ordered', number: 10 },
    ]);
  });

  it('nests by indentation, to two levels', () => {
    const blocks = parseMarkdown('- Morning\n  - Workout\n    - Warm-up\n      - deeper');
    expect(blocks.map((b) => (b.type === 'bullet' ? b.depth : -1))).toEqual([0, 1, 2, 2]);
  });

  it('shows headings as emphasised lines, not as ### text', () => {
    const [h] = parseMarkdown('### Your day');
    expect(h).toMatchObject({ type: 'heading' });
    expect(plainText('## Plan ##')).toBe('Plan');
  });

  it('separates paragraphs on blank lines and keeps soft line breaks', () => {
    const blocks = parseMarkdown('First line\nsecond line\n\nNext paragraph');
    expect(blocks).toHaveLength(2);
    expect(plainText('First line\nsecond line\n\nNext paragraph')).toBe(
      'First line\nsecond line\nNext paragraph'
    );
  });

  it('joins a wrapped list item back onto its bullet', () => {
    const blocks = parseMarkdown('- A long item that\n  wraps onto a second line\n- Short');
    expect(blocks).toHaveLength(2);
    expect(plainText('- A long item that\n  wraps onto a second line')).toBe(
      'A long item that wraps onto a second line'
    );
  });

  it('drops horizontal rules but keeps the text around them', () => {
    expect(parseMarkdown('Above\n\n---\n\nBelow').map((b) => b.type)).toEqual([
      'paragraph',
      'paragraph',
    ]);
    expect(parseMarkdown('***')).toEqual([]);
  });

  it('keeps a fenced code block verbatim, with no formatting inside', () => {
    const [block] = parseMarkdown('```\nconst x = **not bold**;\n```');
    expect(block).toEqual({ type: 'code', text: 'const x = **not bold**;' });
  });

  it('flattens a table into readable rows', () => {
    const md = '| Habit | Streak |\n|---|---|\n| Read | 4 |';
    expect(plainText(md)).toBe('Habit · Streak\nRead · 4');
  });

  it('survives an unfinished code fence while the text is incomplete', () => {
    expect(() => parseMarkdown('```\nhalf a block')).not.toThrow();
  });

  it('handles empty and whitespace-only replies', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('  \n \n')).toEqual([]);
  });

  it('does not treat a sentence that starts with a number and a dot mid-line as a list', () => {
    expect(parseMarkdown('It costs 3.50 today').map((b) => b.type)).toEqual(['paragraph']);
  });
});
