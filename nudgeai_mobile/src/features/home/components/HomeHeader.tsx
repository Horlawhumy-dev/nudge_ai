import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { UserAvatar } from '@/features/auth/components/UserAvatar';
import { colors } from '@/theme';

type HomeHeaderProps = {
  greeting: string;
  streak: number;
  unread: number;
};

export function HomeHeader({ greeting, streak, unread }: HomeHeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open profile"
        onPress={() => router.navigate('/profile')}
      >
        <UserAvatar size={48} />
      </Pressable>
      <View style={styles.texts}>
        <Text variant="heading" style={styles.greeting} numberOfLines={1}>
          {greeting}
        </Text>
        {streak > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${streak} day streak, view details`}
            hitSlop={8}
            onPress={() => router.push('/streak')}
            style={styles.streak}
          >
            <RNText style={styles.flame}>🔥</RNText>
            <Text variant="bodyLarge" color={colors.textSecondary}>
              {streak} days
            </Text>
            <Icon name="chevron-forward" size={14} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        hitSlop={10}
        onPress={() => router.push('/notifications')}
      >
        <Icon name="notifications-outline" size={28} color={colors.textSecondary} />
        {unread > 0 ? (
          <View style={styles.badge}>
            <Text variant="caption" color={colors.white} style={styles.badgeText}>
              {unread}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  texts: { flex: 1, gap: 2 },
  greeting: { fontSize: 18, lineHeight: 24 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flame: { fontSize: 16 },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#E5171F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, lineHeight: 14 },
});
