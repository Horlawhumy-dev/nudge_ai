export type NudgeKind = 'nudge' | 'summary' | 'streak' | 'insight' | 'system' | 'reminder';

export type NudgeNotification = {
  id: string;
  kind: NudgeKind;
  title: string;
  body: string;
  /** Epoch milliseconds. */
  createdAt: number;
  read: boolean;
  /** Where tapping the item goes. */
  href?: '/habits' | '/tasks' | '/progress' | '/chat' | '/home' | '/report' | '/streak';
};
