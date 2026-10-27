/** "10:00 PM" → minutes since midnight (1320). Returns NaN for unparseable input. */
export function parseClock(value: string): number {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value.trim());
  if (!match) return Number.NaN;
  const hour = Number(match[1]) % 12;
  const pm = match[3].toUpperCase() === 'PM';
  return (hour + (pm ? 12 : 0)) * 60 + Number(match[2]);
}

/** Whole hours between two clock times, wrapping past midnight ("10:00 PM" → "7:00 AM" = 9). */
export function quietHoursLength(from: string, to: string): number {
  const start = parseClock(from);
  const end = parseClock(to);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  const minutes = (end - start + 24 * 60) % (24 * 60);
  return Math.round(minutes / 60);
}

/** Hourly options "12:00 AM" … "11:00 PM". */
export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => {
  const label = `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}`;
  return { label, value: label };
});
