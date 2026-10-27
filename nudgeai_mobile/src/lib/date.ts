/** Calendar-day helpers. Dates are stored as local "YYYY-MM-DD" keys so they survive persistence and timezones. */

export type DateKey = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function dateKey(date: Date = new Date()): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight for a key; returns an Invalid Date for malformed input. */
export function parseDateKey(key: DateKey): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return new Date(Number.NaN);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  return next;
}

export function addDaysToKey(key: DateKey, days: number): DateKey {
  return dateKey(addDays(parseDateKey(key), days));
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: DateKey, to: DateKey): number {
  const a = parseDateKey(from);
  const b = parseDateKey(to);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** "Today", "Tomorrow", "Yesterday", otherwise "Mon, May 11". */
export function formatRelativeDate(key: DateKey, now: Date = new Date()): string {
  const delta = diffDays(dateKey(now), key);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  const date = parseDateKey(key);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "dd/mm/yyyy" typed by the user → key, or null when it isn't a real date. */
export function keyFromDisplay(text: string): DateKey | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const key = `${match[3]}-${match[2]}-${match[1]}`;
  const date = parseDateKey(key);
  return dateKey(date) === key ? key : null;
}

/** key → "dd/mm/yyyy" */
export function displayFromKey(key: DateKey): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

/** Days of a calendar month as a Monday-first grid; leading/trailing cells are null. */
export function monthGrid(year: number, month: number): (DateKey | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells: (DateKey | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= count; d++) cells.push(dateKey(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
