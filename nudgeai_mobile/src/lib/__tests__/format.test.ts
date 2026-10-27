import { dayPart, firstName, formatCountdown, formatOrdinalDate, greeting } from '../format';

describe('format helpers', () => {
  it('formats the resend countdown', () => {
    expect(formatCountdown(59)).toBe('00:59');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-3)).toBe('00:00');
    expect(formatCountdown(75)).toBe('01:15');
  });

  it('adds ordinal suffixes', () => {
    expect(formatOrdinalDate(new Date(2026, 4, 13))).toBe('13th May 2026');
    expect(formatOrdinalDate(new Date(2026, 4, 1))).toBe('1st May 2026');
    expect(formatOrdinalDate(new Date(2026, 4, 22))).toBe('22nd May 2026');
    expect(formatOrdinalDate(new Date(2026, 4, 11))).toBe('11th May 2026');
  });

  it('greets by time of day', () => {
    expect(dayPart(new Date(2026, 4, 1, 8))).toBe('morning');
    expect(dayPart(new Date(2026, 4, 1, 14))).toBe('afternoon');
    expect(dayPart(new Date(2026, 4, 1, 20))).toBe('evening');
    expect(greeting('Rophy', new Date(2026, 4, 1, 8))).toBe('Good morning, Rophy');
  });

  it('extracts a first name', () => {
    expect(firstName('Rophy Alade')).toBe('Rophy');
    expect(firstName('  Rophy ')).toBe('Rophy');
    expect(firstName('')).toBe('');
  });
});
