import { addDays } from '@/lib/date';

import { buildSeedTasks } from '../data';
import {
  dayLabel,
  doneCount,
  dueAt,
  formatClock,
  formatTimeRange,
  groupTasks,
  isForToday,
  isVisible,
  matchesFilter,
  plusOneHour,
  taskStatus,
} from '../utils';

const morning = new Date(2026, 4, 13, 8, 0);
const evening = new Date(2026, 4, 13, 21, 0);

describe('task utils', () => {
  const seeds = buildSeedTasks(morning);
  const [caseStudy, reply, , review] = seeds;

  it('derives status from the clock, not a stored flag', () => {
    expect(taskStatus(caseStudy, morning)).toBe('overdue'); // dated yesterday
    expect(taskStatus(reply, morning)).toBe('completed');
    expect(taskStatus(review, morning)).toBe('upcoming');
    expect(taskStatus(review, evening)).toBe('overdue'); // 2–3pm has passed by 9pm
  });

  it('matches the design list in the morning: 1 overdue, 2 done, 2 upcoming', () => {
    const sections = groupTasks(seeds, morning);
    expect(sections.map((s) => [s.title, s.tasks.length])).toEqual([
      ['Overdue', 1],
      ['Completed', 2],
      ['Upcoming', 2],
    ]);
    expect(groupTasks([], morning)).toEqual([]);
  });

  it('orders each section by due time', () => {
    const upcoming = groupTasks(seeds, morning).find((s) => s.status === 'upcoming');
    expect(upcoming?.tasks.map((t) => t.id)).toEqual(['task_review', 'task_call']);
  });

  it('filters by status', () => {
    expect(seeds.filter((t) => matchesFilter(t, 'All', morning))).toHaveLength(5);
    expect(seeds.filter((t) => matchesFilter(t, 'Completed', morning))).toHaveLength(2);
    expect(seeds.filter((t) => matchesFilter(t, 'Overdue', morning))).toHaveLength(1);
  });

  it('shows overdue and future tasks, and drops old completed ones', () => {
    const old = { ...reply, date: '2026-05-01' };
    const future = { ...review, date: '2026-05-20' };
    expect(isVisible(old, morning)).toBe(false);
    expect(isVisible(future, morning)).toBe(true);
    expect(isVisible(caseStudy, morning)).toBe(true);
  });

  it("builds today's list from today's tasks plus overdue carry-over", () => {
    expect(seeds.filter((t) => isForToday(t, morning))).toHaveLength(5);
    const tomorrow = { ...review, date: '2026-05-14' };
    expect(isForToday(tomorrow, morning)).toBe(false);
  });

  it('labels non-today dates', () => {
    expect(dayLabel(review, morning)).toBeNull();
    expect(dayLabel(caseStudy, morning)).toBe('Yesterday');
  });

  it('formats times', () => {
    expect(formatClock('14:30')).toBe('2:30 pm');
    expect(formatClock('00:05')).toBe('12:05 am');
    expect(formatTimeRange({ startTime: '09:00', endTime: '10:45' })).toBe('9:00 am - 10:45 am');
    expect(formatTimeRange({ startTime: null, endTime: null })).toBe('All day');
    expect(plusOneHour('23:30')).toBe('00:30');
  });

  it('computes due moments with sensible fallbacks', () => {
    expect(dueAt({ date: '2026-05-13', startTime: '09:00', endTime: '10:45' }).getHours()).toBe(10);
    expect(dueAt({ date: '2026-05-13', startTime: '09:00', endTime: null }).getHours()).toBe(9);
    expect(dueAt({ date: '2026-05-13', startTime: null, endTime: null }).getHours()).toBe(23);
  });

  it('counts completed tasks', () => {
    expect(doneCount(seeds)).toBe(2);
    expect(addDays(morning, 1).getDate()).toBe(14);
  });
});
