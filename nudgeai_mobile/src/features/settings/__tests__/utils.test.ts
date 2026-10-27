import { HOUR_OPTIONS, parseClock, quietHoursLength } from '../utils';

describe('settings utils', () => {
  it('parses 12-hour clock text', () => {
    expect(parseClock('10:00 PM')).toBe(22 * 60);
    expect(parseClock('12:00 AM')).toBe(0);
    expect(parseClock('12:30 PM')).toBe(12 * 60 + 30);
    expect(parseClock('7:00 AM')).toBe(7 * 60);
    expect(parseClock('nope')).toBeNaN();
  });

  it('measures quiet hours across midnight', () => {
    expect(quietHoursLength('10:00 PM', '7:00 AM')).toBe(9);
    expect(quietHoursLength('1:00 AM', '6:00 AM')).toBe(5);
    expect(quietHoursLength('bad', '7:00 AM')).toBe(0);
  });

  it('offers 24 hourly options', () => {
    expect(HOUR_OPTIONS).toHaveLength(24);
    expect(HOUR_OPTIONS[0].label).toBe('12:00 AM');
    expect(HOUR_OPTIONS[23].label).toBe('11:00 PM');
  });
});
