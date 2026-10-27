import { seedTasks } from '../data';
import { doneCount, formatClock, groupTasks, matchesFilter, taskStatus } from '../utils';

describe('task utils', () => {
  it('derives status from done/overdue flags', () => {
    const [caseStudy, reply, , review] = seedTasks;
    expect(taskStatus(caseStudy)).toBe('overdue');
    expect(taskStatus(reply)).toBe('completed');
    expect(taskStatus(review)).toBe('upcoming');
  });

  it('groups into ordered, non-empty sections', () => {
    const sections = groupTasks(seedTasks);
    expect(sections.map((s) => s.title)).toEqual(['Overdue', 'Completed', 'Upcoming']);
    expect(sections.map((s) => s.tasks.length)).toEqual([1, 2, 2]);
    expect(groupTasks([])).toEqual([]);
  });

  it('filters by status', () => {
    expect(seedTasks.filter((t) => matchesFilter(t, 'All'))).toHaveLength(5);
    expect(seedTasks.filter((t) => matchesFilter(t, 'Completed'))).toHaveLength(2);
    expect(seedTasks.filter((t) => matchesFilter(t, 'Overdue'))).toHaveLength(1);
  });

  it('counts completed tasks', () => {
    expect(doneCount(seedTasks)).toBe(2);
  });

  it('formats 24h clock text', () => {
    expect(formatClock('14:30')).toBe('2:30 pm');
    expect(formatClock('00:05')).toBe('12:05 am');
    expect(formatClock('12:00')).toBe('12:00 pm');
    expect(formatClock('Anytime')).toBe('Anytime');
  });
});
