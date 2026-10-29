import { dayPart } from '@/lib/format';

export type WelcomeInput = {
  name: string;
  now: Date;
  /** `new` after setup; `returning` when someone logs in. */
  kind: 'new' | 'returning';
  /** Habits not yet ticked today. */
  habitsLeft: number;
  /** Tasks for today not yet done. */
  tasksLeft: number;
  /** Everything they have set up, done or not (tells a fresh account from a finished day). */
  habitsTotal: number;
  streak: number;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "2 habits and 1 task", "3 tasks", ... */
function leftToDo(habits: number, tasks: number): string {
  const parts = [habits > 0 && plural(habits, 'habit'), tasks > 0 && plural(tasks, 'task')].filter(
    Boolean
  );
  return parts.join(' and ');
}

export type Welcome = {
  /** One short line for the screen. */
  headline: string;
  /** What is said aloud: the headline plus one line that fits today. */
  spoken: string;
};

/**
 * A warm, personal welcome that reflects where the person actually is today: their streak, what is
 * left to do, or an invitation to start. Deterministic and instant, so it can be spoken right
 * after login without waiting on a model.
 */
export function buildWelcome(input: WelcomeInput): Welcome {
  const { name, kind, habitsLeft, tasksLeft, habitsTotal, streak, now } = input;
  const who = name.trim() || 'there';

  if (kind === 'new') {
    const headline = `Welcome to Nudge, ${who}!`;
    return {
      headline,
      spoken: `${headline} I'm here to help you stay on track, one small step at a time. Tell me what you're working on, and we'll start from there.`,
    };
  }

  const headline = `Good ${dayPart(now)}, ${who}!`;
  const left = leftToDo(habitsLeft, tasksLeft);

  let next: string;
  if (streak >= 2 && habitsLeft > 0) {
    next = `You're on a ${streak}-day streak, so let's keep it going. You've got ${left} today.`;
  } else if (left) {
    next = `You've got ${left} today. Want to start with the easiest one?`;
  } else if (habitsTotal > 0) {
    next = `You're all caught up today. Lovely work.`;
  } else {
    next = `Shall we set up your first habit together?`;
  }
  return { headline, spoken: `Welcome back. ${headline} ${next}` };
}
