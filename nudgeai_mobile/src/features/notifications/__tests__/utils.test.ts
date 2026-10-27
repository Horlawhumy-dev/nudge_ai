import { buildSeedNotifications } from '../data';
import { formatAge, groupNotifications, unreadCount } from '../utils';

const noon = new Date(2026, 4, 13, 12, 0).getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;

describe('notification utils', () => {
  it('counts unread items (the bell badge)', () => {
    expect(unreadCount(buildSeedNotifications(noon))).toBe(3);
    expect(unreadCount([])).toBe(0);
  });

  it('formats ages', () => {
    expect(formatAge(noon - 20_000, noon)).toBe('Just now');
    expect(formatAge(noon - 12 * MIN, noon)).toBe('12 min ago');
    expect(formatAge(noon - 3 * HOUR, noon)).toBe('3 h ago');
    expect(formatAge(noon - 24 * HOUR, noon)).toBe('Yesterday');
    expect(formatAge(noon - 80 * HOUR, noon)).toMatch(/May 10/);
  });

  it('groups newest-first into Today and Earlier', () => {
    const groups = groupNotifications(buildSeedNotifications(noon), noon);
    expect(groups.map((g) => g.title)).toEqual(['Today', 'Earlier']);
    expect(groups[0].items.map((n) => n.id)).toEqual(['n1', 'n2', 'n3']);
    expect(groups[1].items.map((n) => n.id)).toEqual(['n4', 'n5']);
    expect(groupNotifications([], noon)).toEqual([]);
  });
});
