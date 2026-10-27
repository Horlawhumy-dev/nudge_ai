export type ProgressTab = 'habits' | 'tasks';
export type ProgressPeriod = 'Weekly' | 'Monthly';
export type DayStatus = 'completed' | 'some' | 'missed' | 'today' | 'future';

export type BarDatum = { label: string; value: number };

export type TopHabit = {
  id: string;
  emoji: string;
  name: string;
  streak: number;
  completion: number;
  accentIndex: number;
};
export type TopTaskGroup = {
  id: string;
  emoji: string;
  name: string;
  completion: number;
  accentIndex: number;
};
export type OverdueTask = {
  id: string;
  icon: 'document-text-outline' | 'call';
  title: string;
  times: number;
};
