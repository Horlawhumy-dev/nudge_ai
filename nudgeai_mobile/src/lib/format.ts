const WEEKDAY_MONTH_DAY: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };

/** "Monday, May 10" */
export function formatLongDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', WEEKDAY_MONTH_DAY);
}

/** "Today, 13th May 2026" */
export function formatOrdinalDate(date: Date = new Date()): string {
  const day = date.getDate();
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][day % 10] ?? 'th');
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  return `${day}${suffix} ${month} ${date.getFullYear()}`;
}

/** 59 → "00:59" */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export type DayPart = 'morning' | 'afternoon' | 'evening';

export function dayPart(date: Date = new Date()): DayPart {
  const h = date.getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

export function greeting(name: string, date: Date = new Date()): string {
  return `Good ${dayPart(date)}, ${name}`;
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? '';
}

/** Pause for mocked latency so screens exercise real loading states. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let counter = 0;
/** Short unique id for locally created records (until the backend assigns real ones). */
export function createId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter}`;
}
