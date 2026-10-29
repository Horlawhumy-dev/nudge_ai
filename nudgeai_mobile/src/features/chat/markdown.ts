/**
 * A deliberately small Markdown reader for assistant replies: just what a chat bubble needs.
 * Models write `**bold**`, `- ` / `* ` bullets, `1.` lists and the odd heading; shown raw those
 * read as noise on a phone. Anything not recognised is kept as plain text, never dropped, so a
 * stray `*` or `_` (as in "5 * 3" or "snake_case") stays exactly as written.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: Inline[] }
  | { type: 'italic'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; label: string; url: string };

export type Block =
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'heading'; inlines: Inline[] }
  | { type: 'bullet'; inlines: Inline[]; depth: number }
  | { type: 'ordered'; inlines: Inline[]; number: number; depth: number }
  | { type: 'code'; text: string };

// ------------------------------------------------------------------------------ inline

const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let plain = '';
  const flush = () => {
    if (plain) out.push({ type: 'text', text: plain });
    plain = '';
  };

  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);

    // `code`
    if (rest[0] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ type: 'code', text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // **bold** and __bold__
    if (rest.startsWith('**') || rest.startsWith('__')) {
      const marker = rest.slice(0, 2);
      const end = text.indexOf(marker, i + 2);
      const inner = end > i + 2 ? text.slice(i + 2, end) : '';
      if (inner.trim() && !/^\s|\s$/.test(inner)) {
        if (marker === '**' || (!isWordChar(text[i - 1]) && !isWordChar(text[end + 2]))) {
          flush();
          out.push({ type: 'bold', children: parseInline(inner) });
          i = end + 2;
          continue;
        }
      }
    }

    // [label](https://url)
    if (rest[0] === '[') {
      const match = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/.exec(rest);
      if (match) {
        flush();
        out.push({ type: 'link', label: match[1], url: match[2] });
        i += match[0].length;
        continue;
      }
    }

    // *italic* and _italic_ (underscores only at word edges, so snake_case survives)
    if (rest[0] === '*' || rest[0] === '_') {
      const marker = rest[0];
      const end = text.indexOf(marker, i + 1);
      const inner = end > i + 1 ? text.slice(i + 1, end) : '';
      const edgesOk = marker === '*' || (!isWordChar(text[i - 1]) && !isWordChar(text[end + 1]));
      if (inner && !/^\s|\s$/.test(inner) && !inner.includes(marker) && edgesOk) {
        flush();
        out.push({ type: 'italic', children: parseInline(inner) });
        i = end + 1;
        continue;
      }
    }

    plain += text[i];
    i += 1;
  }
  flush();
  return out;
}

// ------------------------------------------------------------------------------- blocks

const BULLET = /^(\s*)([-*•+])\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,3})[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const FENCE = /^\s*```/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;

/** Two spaces of indent is one level of nesting. */
const depthOf = (indent: string) => Math.min(2, Math.floor(indent.replace(/\t/g, '  ').length / 2));

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const endParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: 'paragraph', inlines: parseInline(paragraph.join('\n')) });
    paragraph = [];
  };

  for (let n = 0; n < lines.length; n += 1) {
    const line = lines[n];

    if (FENCE.test(line)) {
      endParagraph();
      const code: string[] = [];
      n += 1;
      while (n < lines.length && !FENCE.test(lines[n])) {
        code.push(lines[n]);
        n += 1;
      }
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }

    if (line.trim() === '') {
      endParagraph();
      continue;
    }

    if (RULE.test(line)) {
      endParagraph(); // a divider line adds nothing in a chat bubble
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      endParagraph();
      blocks.push({ type: 'heading', inlines: parseInline(heading[1]) });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      endParagraph();
      blocks.push({ type: 'bullet', inlines: parseInline(bullet[3]), depth: depthOf(bullet[1]) });
      continue;
    }

    const ordered = ORDERED.exec(line);
    if (ordered) {
      endParagraph();
      blocks.push({
        type: 'ordered',
        inlines: parseInline(ordered[3]),
        number: Number(ordered[2]),
        depth: depthOf(ordered[1]),
      });
      continue;
    }

    // Tables don't fit a phone: show each row as "a · b · c" and drop the divider row.
    if (TABLE_ROW.test(line)) {
      endParagraph();
      // `|---|---|` has no letters or digits: it is only the divider under the header.
      if (/[\p{L}\p{N}]/u.test(line)) {
        const cells = line
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim())
          .filter(Boolean);
        if (cells.length > 0) {
          blocks.push({ type: 'paragraph', inlines: parseInline(cells.join(' · ')) });
        }
      }
      continue;
    }

    // A wrapped continuation of the previous list item (indented, no marker of its own).
    const previous = blocks[blocks.length - 1];
    if (
      paragraph.length === 0 &&
      /^\s{2,}\S/.test(line) &&
      previous &&
      (previous.type === 'bullet' || previous.type === 'ordered')
    ) {
      previous.inlines = [
        ...previous.inlines,
        { type: 'text', text: ' ' },
        ...parseInline(line.trim()),
      ];
      continue;
    }

    paragraph.push(line.trim());
  }
  endParagraph();
  return blocks;
}

/** The text with all formatting characters removed (for accessibility labels and copying). */
export function plainText(source: string): string {
  const flat = (inlines: Inline[]): string =>
    inlines
      .map((i) => {
        if (i.type === 'text' || i.type === 'code') return i.text;
        if (i.type === 'link') return i.label;
        return flat(i.children);
      })
      .join('');
  return parseMarkdown(source)
    .map((b) => (b.type === 'code' ? b.text : flat(b.inlines)))
    .join('\n');
}
