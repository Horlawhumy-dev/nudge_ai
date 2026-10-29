import { render, screen } from '@testing-library/react-native';

import { fonts } from '@/theme';

import { ChatMarkdown } from '../components/ChatMarkdown';

/** Every piece of text on screen, flattened, as the user reads it. */
function visibleText(): string {
  const collect = (node: unknown): string => {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(collect).join('');
    if (node && typeof node === 'object') {
      return collect((node as { children?: unknown }).children);
    }
    return '';
  };
  return collect(screen.toJSON());
}

const REPLY = [
  'Here is your day, **Ada**:',
  '',
  '- **Deep work** at 10:00',
  '* Read 20 pages',
  '',
  '1. Stretch',
  '2. Plan tomorrow',
  '',
  'Want me to *move* anything?',
].join('\n');

describe('ChatMarkdown', () => {
  it('shows the formatting, not the formatting characters', async () => {
    await render(<ChatMarkdown text={REPLY} />);
    const shown = visibleText();
    expect(shown).not.toContain('**');
    expect(shown).not.toMatch(/(^|\n)\s*[-*] /); // no leftover dash or star bullets
    expect(shown).toContain('Here is your day, Ada:');
    expect(shown).toContain('Deep work');
    expect(shown).toContain('Read 20 pages');
    expect(shown).toContain('1.');
    expect(shown).toContain('Want me to move anything?');
  });

  it('draws bullets as bullets', async () => {
    await render(<ChatMarkdown text={'- one\n- two'} />);
    expect(screen.getAllByText('•')).toHaveLength(2);
  });

  it('puts bold words in the bold font', async () => {
    await render(<ChatMarkdown text="Do **deep work** now" />);
    const bold = screen.getByText('deep work');
    expect(JSON.stringify(bold.props.style)).toContain(fonts.bodySemiBold);
  });

  it('leaves plain text exactly as it was', async () => {
    await render(<ChatMarkdown text="Nice work today. See you tomorrow!" />);
    expect(screen.getByText('Nice work today. See you tomorrow!')).toBeTruthy();
  });

  it('keeps a lone asterisk that is not formatting', async () => {
    await render(<ChatMarkdown text="That is 5 * 3 = 15" />);
    expect(visibleText()).toBe('That is 5 * 3 = 15');
  });

  it('renders nothing for an empty reply instead of crashing', async () => {
    await render(<ChatMarkdown text="" />);
    expect(visibleText()).toBe('');
  });
});
