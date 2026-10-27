import { Screen, ScreenHeader } from '@/components/ui';
import { ToggleRow } from '@/features/settings/components/ToggleRow';
import { usePreferencesStore, type NotificationKey } from '@/store/usePreferencesStore';
import type { IconName } from '@/components/ui';
import { colors } from '@/theme';

const ITEMS: readonly { key: NotificationKey; title: string; subtitle: string; icon: IconName }[] =
  [
    {
      key: 'push',
      title: 'Push notifications',
      subtitle: 'Habits and task alerts',
      icon: 'notifications-outline',
    },
    {
      key: 'voice',
      title: 'Voice reminders',
      subtitle: 'AI speaks your nudges aloud',
      icon: 'mic-outline',
    },
    {
      key: 'morningSummary',
      title: 'Morning summary',
      subtitle: 'Daily overview when you wake up',
      icon: 'newspaper-outline',
    },
    {
      key: 'weeklyReport',
      title: 'Weekly AI report',
      subtitle: 'Progress summary every Monday',
      icon: 'pulse-outline',
    },
    {
      key: 'streakAlerts',
      title: 'Streak alerts',
      subtitle: 'Notify me when my streak is at risk',
      icon: 'heart-outline',
    },
  ];

export default function NotificationSettings() {
  const notifications = usePreferencesStore((s) => s.notifications);
  const setNotification = usePreferencesStore((s) => s.setNotification);

  return (
    <Screen scroll background={colors.background} contentStyle={{ gap: 14, paddingTop: 8 }}>
      <ScreenHeader title="Notification settings" />
      {ITEMS.map((item) => (
        <ToggleRow
          key={item.key}
          title={item.title}
          subtitle={item.subtitle}
          icon={item.icon}
          value={notifications[item.key]}
          onValueChange={(v) => setNotification(item.key, v)}
        />
      ))}
    </Screen>
  );
}
