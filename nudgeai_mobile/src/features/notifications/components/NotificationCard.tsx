import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text, type IconName } from '@/components/ui';
import { colors, radius } from '@/theme';

import type { NudgeKind, NudgeNotification } from '../types';
import { formatAge } from '../utils';

const KIND: Record<NudgeKind, { icon: IconName; tint: string; color: string }> = {
  nudge: { icon: 'notifications', tint: colors.primaryTint, color: colors.primary },
  summary: { icon: 'sunny', tint: '#FFF1CC', color: '#E39A00' },
  streak: { icon: 'flame', tint: colors.dangerSoft, color: colors.danger },
  insight: { icon: 'sparkles', tint: '#E4EBFF', color: '#5E7BE8' },
  system: { icon: 'information-circle', tint: colors.fill, color: colors.textSecondary },
};

type NotificationCardProps = {
  item: NudgeNotification;
  now: number;
  onPress: () => void;
};

export function NotificationCard({ item, now, onPress }: NotificationCardProps) {
  const kind = KIND[item.kind];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.read ? '' : 'Unread. '}${item.title}. ${item.body}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        !item.read && styles.unread,
        pressed && { opacity: 0.9 },
      ]}
    >
      <View style={[styles.tile, { backgroundColor: kind.tint }]}>
        <Icon name={kind.icon} size={22} color={kind.color} />
      </View>
      <View style={styles.texts}>
        <View style={styles.titleRow}>
          <Text variant="subheading" style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          {!item.read ? <View style={styles.dot} /> : null}
        </View>
        <Text variant="body" color={colors.textSecondary} numberOfLines={3}>
          {item.body}
        </Text>
        <Text variant="caption" color={colors.textMuted}>
          {formatAge(item.createdAt, now)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
  },
  unread: { borderColor: colors.primaryTint, backgroundColor: '#FDFAFF' },
  tile: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
});
