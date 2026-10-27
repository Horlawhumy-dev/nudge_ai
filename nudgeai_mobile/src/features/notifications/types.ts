export type NudgeKind = 'nudge' | 'summary' | 'streak' | 'insight' | 'system';

export type NudgeNotification = {
  id: string;
  kind: NudgeKind;
  title: string;
  body: string;
  /** Epoch milliseconds. */
  createdAt: number;
  read: boolean;
  /** Where tapping the item goes. */
  href?: '/habits' | '/tasks' | '/progress' | '/chat' | '/home';
};
