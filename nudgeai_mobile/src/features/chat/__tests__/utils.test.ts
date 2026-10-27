import { buildSeedConversations } from '../data';
import { conversationMode, conversationTitle, groupConversations, groupLabel } from '../utils';

const now = new Date(2026, 4, 13, 12, 0);
const seeds = buildSeedConversations(now.getTime());

describe('chat utils', () => {
  it('titles a conversation by the first user message and truncates long ones', () => {
    expect(conversationTitle(seeds[0])).toBe('Push my 10am deep work to 11am please');
    expect(conversationTitle({ messages: [] })).toBe('New chat');
    const long = { messages: [{ id: '1', role: 'user' as const, text: 'x'.repeat(200) }] };
    expect(conversationTitle(long)).toHaveLength(70);
    expect(conversationTitle(long).endsWith('…')).toBe(true);
  });

  it('derives the mode from how the user spoke', () => {
    expect(conversationMode(seeds[0])).toBe('Voice + text');
    expect(conversationMode(seeds[1])).toBe('Text');
    expect(conversationMode(seeds[3])).toBe('Voice');
    expect(conversationMode({ messages: [] })).toBe('Text');
  });

  it('labels days', () => {
    expect(groupLabel(now.getTime() - 3_600_000, now)).toBe('Today');
    expect(groupLabel(now.getTime() - 24 * 3_600_000, now)).toBe('Yesterday');
    expect(groupLabel(now.getTime() - 96 * 3_600_000, now)).toBe('May 9');
  });

  it('groups newest first', () => {
    const groups = groupConversations(seeds, now);
    expect(groups.map((g) => g.title)).toEqual(['Today', 'Yesterday', 'May 10']);
    expect(groups[0].items.map((c) => c.id)).toEqual(['c2', 'c1']);
  });
});
