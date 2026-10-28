import { habitProgressFromApi, taskProgressFromApi } from '../endpoints/analytics';

describe('progress mapping', () => {
  it('turns the server’s habit progress into what the Progress tab draws', () => {
    const view = habitProgressFromApi({
      bars: [{ label: 'Mon', value: 50 }],
      streak: 7,
      best_streak: 12,
      consistency: 92,
      all_time_wins: 24,
      top_habits: [
        { habit_id: 'h1', name: 'Workout', emoji: '💪', streak: 7, completion: 95 },
        { habit_id: 'h2', name: 'Read', emoji: '📚', streak: 3, completion: 60 },
      ],
      consistency_map: [
        { date: '2026-01-01', status: 'completed' },
        { date: '2026-01-02', status: 'today' },
        { date: '2026-01-03', status: 'future' },
      ],
      insight: 'Wednesdays are your strongest day.',
    });
    expect(view.overview).toEqual({ streak: 7, consistency: 92, allTimeWins: 24 });
    expect(view.topHabits.map((h) => [h.name, h.accentIndex])).toEqual([
      ['Workout', 0],
      ['Read', 1],
    ]);
    expect(view.map).toEqual(['completed', 'today', 'future']);
    expect(view.insight).toBe('Wednesdays are your strongest day.');
  });

  it('shows only the times of day that have tasks, and at least 1x for overdue ones', () => {
    const view = taskProgressFromApi({
      bars: [],
      done: 18,
      total: 25,
      completion_rate: 72,
      on_time_rate: 85,
      overdue: 2,
      time_groups: [
        { name: 'Morning', completion: 85, total: 5 },
        { name: 'Afternoon', completion: 0, total: 0 },
        { name: 'Evening', completion: 35, total: 2 },
      ],
      most_overdue: [{ task_id: 't1', title: 'Case study deck', days_overdue: 0 }],
      insight: null,
    });
    expect(view.groups.map((g) => g.name)).toEqual(['Morning', 'Evening']);
    expect(view.overview).toMatchObject({
      done: 18,
      total: 25,
      completionRate: 72,
      onTimeRate: 85,
    });
    expect(view.overdue[0]).toMatchObject({ title: 'Case study deck', times: 1 });
    expect(view.insight).toBeNull();
  });
});
