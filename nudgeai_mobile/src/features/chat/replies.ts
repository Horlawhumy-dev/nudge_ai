/**
 * Scripted replies standing in for the backend chat endpoint. Matches the conversations in
 * the design; anything else gets a generic acknowledgement. Swap for the API call later.
 */
export function replyTo(
  input: string,
  name: string,
  counts: { habits: number; tasks: number }
): string {
  const text = input.toLowerCase();
  const who = name || 'there';

  if (text.includes('summary')) {
    return `Good morning ${who}! You have ${counts.habits} habits and ${counts.tasks} tasks today. Your deep work session is coming up at 10 am. Want me to clear your morning first?`;
  }
  if (text.includes('push') || text.includes('reschedule')) {
    return 'Done! Deep work rescheduled to 11:00 am. I’ll remind you at 10:00 am so you can wind down first.';
  }
  if (text.includes('suggest') || text.includes('habit')) {
    return 'Here are three small ones to try: a 10-minute evening wind-down, a glass of water after waking, and a 5-minute plan for tomorrow. Want me to add any of them?';
  }
  if (text.includes('thank')) {
    return 'You’re welcome. If you need anything else, I’m here to assist you.';
  }
  return 'Got it. I’ll take care of that and keep you posted.';
}
