import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { EmptyState, Icon, Screen, ScreenHeader, Text } from '@/components/ui';
import { NotificationCard } from '@/features/notifications/components/NotificationCard';
import { groupNotifications, unreadCount } from '@/features/notifications/utils';
import { useNow } from '@/hooks/useNow';
import { haptics } from '@/lib/haptics';
import { useNotificationsStore } from '@/store/useNotificationsStore';
import { toast } from '@/store/useToastStore';
import { colors, radius } from '@/theme';

export default function Notifications() {
  const router = useRouter();
  const now = useNow().getTime();
  const items = useNotificationsStore((s) => s.items);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const dismiss = useNotificationsStore((s) => s.dismiss);
  const restore = useNotificationsStore((s) => s.restore);
  const unread = unreadCount(items);
  const groups = groupNotifications(items, now);

  return (
    <Screen scroll background={colors.background} contentStyle={styles.content}>
      <ScreenHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : undefined}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: unread === 0 }}
            disabled={unread === 0}
            hitSlop={10}
            onPress={() => {
              haptics.success();
              markAllRead();
            }}
          >
            <Text variant="subheading" color={unread > 0 ? colors.primary : colors.textDisabled}>
              Mark all read
            </Text>
          </Pressable>
        }
      />

      {groups.length === 0 ? (
        <View style={styles.empty}>
          <EmptyState
            icon="notifications-off-outline"
            title="You’re all caught up"
            message="Nudges, summaries and streak alerts will show up here."
            actionLabel="Notification settings"
            onAction={() => router.push('/settings/notifications')}
          />
        </View>
      ) : (
        groups.map((group) => (
          <View key={group.title} style={styles.group}>
            <Text variant="bodyLarge" color={colors.textSecondary}>
              {group.title}
            </Text>
            {group.items.map((item) => (
              <ReanimatedSwipeable
                key={item.id}
                overshootRight={false}
                friction={2}
                renderRightActions={() => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Dismiss ${item.title}`}
                    onPress={() => {
                      dismiss(item.id);
                      toast.show('Notification dismissed', {
                        action: { label: 'Undo', onPress: () => restore(item) },
                      });
                    }}
                    style={styles.dismiss}
                  >
                    <Icon name="close" size={24} color={colors.danger} />
                  </Pressable>
                )}
              >
                <NotificationCard
                  item={item}
                  now={now}
                  onPress={() => {
                    markRead(item.id);
                    if (item.href) router.navigate(item.href);
                  }}
                />
              </ReanimatedSwipeable>
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, paddingTop: 8 },
  group: { gap: 12 },
  empty: { marginTop: 80 },
  dismiss: {
    width: 64,
    marginLeft: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
