import type { ChatMessage, Conversation, QuickPrompt } from './types';

export const QUICK_PROMPTS: readonly QuickPrompt[] = [
  { id: 'summary', emoji: '📋', label: 'My day summary' },
  { id: 'reschedule', emoji: '⏰', label: 'Reschedule task' },
  { id: 'suggest', emoji: '💡', label: 'Suggest habits' },
];

const HOUR = 3_600_000;
let n = 0;
const msg = (
  role: ChatMessage['role'],
  text: string,
  via: ChatMessage['via'] = 'text'
): ChatMessage => {
  n += 1;
  return { id: `seed_msg_${n}`, role, text, via };
};

/** Demo history: the conversations shown in the design, with short transcripts. */
export function buildSeedConversations(now: number = Date.now()): Conversation[] {
  return [
    {
      id: 'c1',
      createdAt: now - 3 * HOUR,
      messages: [
        msg('user', 'Push my 10am deep work to 11am please', 'voice'),
        msg(
          'assistant',
          'Done! Deep work rescheduled to 11:00 am. I’ll remind you at 10:00 am so you can wind down first.'
        ),
        msg('user', 'Alright, thank you so much!', 'text'),
      ],
    },
    {
      id: 'c2',
      createdAt: now - 1 * HOUR,
      messages: [
        { ...msg('user', 'My day summary'), promptEmoji: '📋' },
        msg(
          'assistant',
          'Good morning! You have 4 habits and 5 tasks today. Your deep work session is coming up at 10 am. Want me to clear your morning first?'
        ),
      ],
    },
    {
      id: 'c3',
      createdAt: now - 20 * HOUR,
      messages: [
        msg('user', 'Suggest habits for better sleep at night or napping during the day'),
        msg(
          'assistant',
          'Here are three small ones to try: a 10-minute evening wind-down, no screens 30 minutes before bed, and a fixed wake time. Want me to add any of them?'
        ),
        msg('user', 'Add the wind-down one'),
        msg('assistant', 'Added “Evening wind-down” to your evening habits.'),
      ],
    },
    {
      id: 'c4',
      createdAt: now - 33 * HOUR,
      messages: [
        msg('user', 'Reschedule my google meet with developer Josh', 'voice'),
        msg('assistant', 'Sure. When would you like to move it to?', 'voice'),
        msg('user', 'Tomorrow at 3pm', 'voice'),
        msg('assistant', 'Done! Your meeting with Josh is now tomorrow at 3:00 pm.', 'voice'),
      ],
    },
    {
      id: 'c5',
      createdAt: now - 80 * HOUR,
      messages: [
        msg('user', 'Add gym to my evening habits.', 'voice'),
        msg('assistant', 'Added “Gym” to your evening habits.', 'voice'),
      ],
    },
  ];
}
