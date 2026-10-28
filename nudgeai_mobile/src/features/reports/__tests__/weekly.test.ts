import { buildSeedHabits } from '@/features/habits/data';
import { buildSeedTasks } from '@/features/tasks/data';

import { buildWeeklyReport, reportRange } from '../weekly';

const now = new Date(2026, 4, 13, 9);

describe('buildWeeklyReport', () => {
  it('summarises the demo week', () => {
    const report = buildWeeklyReport(buildSeedHabits(now), buildSeedTasks(now), now);
    expect(report.possible).toBe(25); // 7 + 5 + 7 + 6
    expect(report.checkIns).toBe(10); // 1 + 3 + 3 + 3
    expect(report.habitRate).toBe(40);
    expect(report.tasksTotal).toBe(5); // all seed tasks fall inside the 7-day window
    expect(report.tasksDone).toBe(2);
    expect(report.topHabit).not.toBeNull();
    expect(report.headline).toMatch(/quieter|room to grow/);
    expect(report.tips.length).toBeGreaterThan(0);
    expect(report.tips.length).toBeLessThanOrEqual(3);
  });

  it('handles no habits or tasks', () => {
    const report = buildWeeklyReport([], [], now);
    expect(report).toMatchObject({
      habitRate: 0,
      possible: 0,
      tasksTotal: 0,
      bestDay: null,
      topHabit: null,
    });
    expect(report.headline).toMatch(/Add a habit/);
    expect(report.tips).toEqual(['Keep going. Consistency matters more than intensity.']);
  });

  it('caps the rate at 100 and names the strongest day', () => {
    const habit = { ...buildSeedHabits(now)[0], goalDays: 1 };
    const report = buildWeeklyReport([habit, { ...habit, id: 'b' }], [], now);
    expect(report.habitRate).toBeLessThanOrEqual(100);
    expect(report.bestDay?.count).toBe(2);
  });

  it('formats the date range', () => {
    expect(reportRange(now)).toBe('May 7 – May 13');
  });
});
