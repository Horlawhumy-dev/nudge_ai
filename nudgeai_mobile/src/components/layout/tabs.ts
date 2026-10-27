import type { IconName } from '@/components/ui';

export type TabName = 'home' | 'habits' | 'tasks' | 'progress' | 'profile';

export const TAB_ITEMS: Record<TabName, { label: string; icon: IconName }> = {
  home: { label: 'Home', icon: 'home-outline' },
  habits: { label: 'Habits', icon: 'document-text-outline' },
  tasks: { label: 'Tasks', icon: 'clipboard-outline' },
  progress: { label: 'Progress', icon: 'bar-chart-outline' },
  profile: { label: 'Profile', icon: 'person-outline' },
};

export const TAB_BAR_HEIGHT = 68;
