import type { BarDatum, DayStatus, OverdueTask, TopHabit, TopTaskGroup } from './types';

const bars = (labels: string[], values: number[]): BarDatum[] =>
  labels.map((label, i) => ({ label, value: values[i] }));
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKS = ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4'];

export const habitBars = {
  Weekly: bars(DAYS, [78, 52, 92, 22, 46, 68, 38]),
  Monthly: bars(WEEKS, [64, 71, 58, 80]),
};

export const taskBars = {
  Weekly: bars(DAYS, [100, 63, 86, 52, 30, 17, 5]),
  Monthly: bars(WEEKS, [70, 66, 74, 72]),
};

export const habitOverview = { streak: 7, consistency: 92, allTimeWins: 24 };
export const taskOverview = { done: 18, total: 25, completionRate: 72, onTimeRate: 85, overdue: 3 };

export const habitInsight =
  'You’re most consistent on weekdays. Wednesdays are your strongest day. Try habit stacking on weekends to keep momentum.';
export const taskInsight =
  'You completed 85% of your tasks in the morning. Try scheduling your most important tasks before noon for better results.';

export const topHabits: TopHabit[] = [
  { id: 'h1', emoji: '💪', name: 'Morning Workout', streak: 7, completion: 95, accentIndex: 0 },
  { id: 'h2', emoji: '✍️', name: 'Evening Journal', streak: 5, completion: 71, accentIndex: 1 },
  { id: 'h3', emoji: '📚', name: 'Reading 20 mins', streak: 4, completion: 60, accentIndex: 2 },
];

export const topTaskGroups: TopTaskGroup[] = [
  { id: 't1', emoji: '🌅', name: 'Morning', completion: 85, accentIndex: 0 },
  { id: 't2', emoji: '☀️', name: 'Afternoon', completion: 60, accentIndex: 1 },
  { id: 't3', emoji: '🌃', name: 'Evening', completion: 35, accentIndex: 2 },
];

export const overdueTasks: OverdueTask[] = [
  { id: 'o1', icon: 'document-text-outline', title: 'Case study deck', times: 2 },
  { id: 'o2', icon: 'call', title: 'Call with design team', times: 3 },
];

/**
 * One month of consistency, Monday-first, ending in a "today" cell then future cells.
 * `todayIndex` is zero-based; days before it are seeded with a deterministic pattern.
 */
export function buildConsistencyMap(daysInMonth: number, todayIndex: number): DayStatus[] {
  const pattern: DayStatus[] = [
    'completed',
    'missed',
    'completed',
    'completed',
    'missed',
    'some',
    'completed',
    'completed',
    'some',
    'missed',
    'completed',
    'some',
  ];
  return Array.from({ length: daysInMonth }, (_, i) => {
    if (i === todayIndex) return 'today';
    if (i > todayIndex) return 'future';
    return pattern[i % pattern.length];
  });
}
