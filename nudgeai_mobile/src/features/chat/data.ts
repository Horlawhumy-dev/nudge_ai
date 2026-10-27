import type { ConversationSummary, QuickPrompt } from './types';

export const QUICK_PROMPTS: readonly QuickPrompt[] = [
  { id: 'summary', emoji: '📋', label: 'My day summary' },
  { id: 'reschedule', emoji: '⏰', label: 'Reschedule task' },
  { id: 'suggest', emoji: '💡', label: 'Suggest habits' },
];

export const seedConversations: ConversationSummary[] = [
  {
    id: 'c1',
    title: 'Push my 10am deep work to 11am please',
    time: '9:30am',
    messageCount: 3,
    mode: 'Voice + text',
    group: 'Today',
  },
  { id: 'c2', title: 'My day summary', time: '12:00 pm', messageCount: 1, mode: 'Text', group: 'Today' },
  {
    id: 'c3',
    title: 'Suggest habits for better sleep at night or napping during the day',
    time: '8:00 pm',
    messageCount: 6,
    mode: 'Text',
    group: 'Yesterday',
  },
  {
    id: 'c4',
    title: 'Reschedule my google meet with developer Josh',
    time: '10:30 am',
    messageCount: 6,
    mode: 'Voice',
    group: 'Yesterday',
  },
  {
    id: 'c5',
    title: 'Add gym to my evening habits.',
    time: '9:00 am',
    messageCount: 2,
    mode: 'Voice',
    group: 'May 9',
  },
];
