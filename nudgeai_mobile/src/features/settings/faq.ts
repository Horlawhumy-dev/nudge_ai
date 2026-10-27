export type Faq = { id: string; question: string; answer: string };

export const FAQS: readonly Faq[] = [
  {
    id: 'how-nudges',
    question: 'How does Nudge decide when to remind me?',
    answer:
      'Reminders follow the wake-up and sleep windows you chose in setup, and the time of day on each habit. Nothing is sent during your quiet hours.',
  },
  {
    id: 'streak',
    question: 'How is my streak calculated?',
    answer:
      'A habit’s streak counts consecutive days you ticked it. If you haven’t checked in yet today, yesterday’s streak stays alive until the day ends.',
  },
  {
    id: 'stacking',
    question: 'What is habit stacking?',
    answer:
      'Stacking attaches a habit to one you already do, so Nudge reminds you right after you finish the trigger habit. Turn it on in Settings and pick a trigger when creating a habit.',
  },
  {
    id: 'overdue',
    question: 'Why is a task marked overdue?',
    answer:
      'A task becomes overdue once its end time (or start time, or the end of its day) has passed and it isn’t ticked. Edit the task to move it to a new time.',
  },
  {
    id: 'voice',
    question: 'How do I talk to Nudge AI?',
    answer:
      'Open Nudge AI from the Home screen and tap the waveform button in the message bar to switch to voice mode.',
  },
  {
    id: 'tone',
    question: 'Can I change how reminders sound?',
    answer:
      'Yes. Go to Profile → AI Voice & Tone to choose Gentle, Firm or Mix it up, and decide whether reminders use your name, streak or emojis.',
  },
  {
    id: 'undo',
    question: 'I deleted something by mistake.',
    answer:
      'Right after deleting a habit, task or notification, tap Undo in the banner at the top of the screen. It stays for a few seconds.',
  },
  {
    id: 'limits',
    question: 'What are the Free plan limits?',
    answer:
      'Free includes up to 3 habits and 5 daily tasks with basic text notifications. Nudge Pro unlocks unlimited habits and tasks, voice reminders and weekly reports.',
  },
];

/** Case-insensitive match on question or answer. */
export function searchFaqs(query: string, faqs: readonly Faq[] = FAQS): Faq[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...faqs];
  return faqs.filter(
    (f) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q)
  );
}
