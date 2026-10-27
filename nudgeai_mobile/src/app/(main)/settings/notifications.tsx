import { Linking } from 'react-native';

import { Screen, ScreenHeader } from '@/components/ui';
import { ToggleRow } from '@/features/settings/components/ToggleRow';
import { usePreferencesStore, type NotificationKey } from '@/store/usePreferencesStore';
import type { IconName } from '@/components/ui';
import { hasReminderPermission, requestReminderPermission } from '@/services/notifications';
import { toast } from '@/store/useToastStore';
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

  /** Turning push on needs OS permission; if it's refused, leave the switch off and say why. */
  const change = async (key: NotificationKey, value: boolean) => {
    if (key === 'push' && value && !(await hasReminderPermission())) {
      if (!(await requestReminderPermission())) {
        toast.error('Notifications are blocked for Nudge.', {
          action: { label: 'Open settings', onPress: () => void Linking.openSettings() },
        });
        return;
      }
    }
    setNotification(key, value);
  };

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
          onValueChange={(v) => void change(item.key, v)}
        />
      ))}
    </Screen>
  );
}
