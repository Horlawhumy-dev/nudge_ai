import { GOALS } from '../data';
import { DEFAULT_SELECTED, suggestHabits } from '../suggestions';

describe('suggestHabits', () => {
  it('maps each goal to one daily habit, in goal order', () => {
    const result = suggestHabits(['sleep', 'fitness']);
    expect(result.map((s) => s.goalId)).toEqual(['fitness', 'sleep']);
    expect(result.every((s) => s.frequency === 'Daily')).toBe(true);
    expect(new Set(result.map((s) => s.id)).size).toBe(result.length);
  });

  it('falls back to a general starter set when no goals were chosen', () => {
    expect(suggestHabits([]).map((s) => s.goalId)).toEqual(['reading', 'hydration', 'focus']);
  });

  it('ignores unknown goal ids', () => {
    expect(suggestHabits(['nope'])).toEqual([]);
  });

  it('has a suggestion for every goal shown in setup', () => {
    expect(suggestHabits(GOALS.map((g) => g.id))).toHaveLength(GOALS.length);
    expect(DEFAULT_SELECTED).toBe(3);
  });
});
