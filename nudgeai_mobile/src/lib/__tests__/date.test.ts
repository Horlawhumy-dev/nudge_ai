import {
  addDaysToKey,
  dateKey,
  diffDays,
  displayFromKey,
  formatRelativeDate,
  keyFromDisplay,
  monthGrid,
  parseDateKey,
} from '../date';

describe('date helpers', () => {
  it('round-trips local date keys', () => {
    const d = new Date(2026, 4, 3, 23, 59);
    expect(dateKey(d)).toBe('2026-05-03');
    expect(dateKey(parseDateKey('2026-05-03'))).toBe('2026-05-03');
    expect(Number.isNaN(parseDateKey('nope').getTime())).toBe(true);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDaysToKey('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts whole days between keys', () => {
    expect(diffDays('2026-05-01', '2026-05-04')).toBe(3);
    expect(diffDays('2026-05-04', '2026-05-01')).toBe(-3);
    expect(diffDays('2026-05-01', '2026-05-01')).toBe(0);
  });

  it('labels relative dates', () => {
    const now = new Date(2026, 4, 10, 9);
    expect(formatRelativeDate('2026-05-10', now)).toBe('Today');
    expect(formatRelativeDate('2026-05-11', now)).toBe('Tomorrow');
    expect(formatRelativeDate('2026-05-09', now)).toBe('Yesterday');
    expect(formatRelativeDate('2026-05-20', now)).toMatch(/May 20/);
  });

  it('converts dd/mm/yyyy text and rejects impossible dates', () => {
    expect(keyFromDisplay('12/05/2026')).toBe('2026-05-12');
    expect(keyFromDisplay('31/02/2026')).toBeNull();
    expect(keyFromDisplay('12/5/2026')).toBeNull();
    expect(displayFromKey('2026-05-12')).toBe('12/05/2026');
  });

  it('builds Monday-first month grids padded to full weeks', () => {
    const grid = monthGrid(2026, 4); // May 2026 starts on a Friday
    expect(grid.length % 7).toBe(0);
    expect(grid.slice(0, 4)).toEqual([null, null, null, null]);
    expect(grid[4]).toBe('2026-05-01');
    expect(grid.filter(Boolean)).toHaveLength(31);
  });
});
