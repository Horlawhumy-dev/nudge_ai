import { buildWelcome, type WelcomeInput } from '../welcome';

const base: WelcomeInput = {
  name: 'Ada',
  now: new Date(2026, 9, 29, 9, 0),
  kind: 'returning',
  habitsLeft: 0,
  tasksLeft: 0,
  habitsTotal: 0,
  streak: 0,
};

describe('buildWelcome', () => {
  it('greets by name for the time of day', () => {
    expect(buildWelcome(base).headline).toBe('Good morning, Ada!');
    expect(buildWelcome({ ...base, now: new Date(2026, 9, 29, 14) }).headline).toBe(
      'Good afternoon, Ada!'
    );
    expect(buildWelcome({ ...base, now: new Date(2026, 9, 29, 20) }).headline).toBe(
      'Good evening, Ada!'
    );
  });

  it('celebrates a streak and says what is left', () => {
    const { spoken } = buildWelcome({
      ...base,
      streak: 4,
      habitsLeft: 2,
      tasksLeft: 1,
      habitsTotal: 3,
    });
    expect(spoken).toContain('Good morning, Ada!');
    expect(spoken).toContain("You're on a 4-day streak");
    expect(spoken).toContain('2 habits and 1 task');
  });

  it('uses singular and plural correctly', () => {
    expect(buildWelcome({ ...base, habitsLeft: 1, habitsTotal: 1 }).spoken).toContain(
      '1 habit today'
    );
    expect(buildWelcome({ ...base, tasksLeft: 3 }).spoken).toContain('3 tasks today');
    expect(buildWelcome({ ...base, habitsLeft: 1, tasksLeft: 1, habitsTotal: 1 }).spoken).toContain(
      '1 habit and 1 task'
    );
  });

  it('does not mention a streak that is not one yet', () => {
    expect(buildWelcome({ ...base, streak: 1, habitsLeft: 1, habitsTotal: 1 }).spoken).not.toMatch(
      /streak/
    );
  });

  it('does not nag someone who has finished the day', () => {
    const { spoken } = buildWelcome({ ...base, streak: 9, habitsTotal: 3 });
    expect(spoken).toContain('all caught up');
    expect(spoken).not.toMatch(/\d+ (habit|task)/);
  });

  it('invites a brand-new account to start, without a count of zero', () => {
    const { spoken } = buildWelcome(base);
    expect(spoken).toContain('first habit');
    expect(spoken).not.toMatch(/0 /);
  });

  it('welcomes someone who has just finished setting up', () => {
    const w = buildWelcome({ ...base, kind: 'new' });
    expect(w.headline).toBe('Welcome to Nudge, Ada!');
    expect(w.spoken).toContain(w.headline);
    expect(w.spoken).not.toContain('Welcome back');
  });

  it('copes with a missing name', () => {
    expect(buildWelcome({ ...base, name: '  ' }).headline).toBe('Good morning, there!');
  });
});
