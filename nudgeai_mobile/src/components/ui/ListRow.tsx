import { Pressable, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';

import { colors, radius } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Either an Ionicons name, or a custom node (e.g. the AI orb). */
  icon?: IconName | ReactNode;
  destructive?: boolean;
  /** Small pill after the title ("Free"). */
  badge?: string;
  /** Replaces the chevron, e.g. a Toggle. */
  trailing?: ReactNode;
  onPress?: () => void;
};

export function ListRow({
  title,
  subtitle,
  icon,
  destructive = false,
  badge,
  trailing,
  onPress,
}: ListRowProps) {
  const tone = destructive ? colors.danger : colors.text;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
    >
      {icon ? (
        <View style={styles.tile}>
          {typeof icon === 'string' ? (
            <Icon
              name={icon as IconName}
              size={20}
              color={destructive ? colors.danger : colors.textSecondary}
            />
          ) : (
            icon
          )}
        </View>
      ) : null}
      <View style={styles.texts}>
        <View style={styles.titleRow}>
          <Text variant="subheading" color={tone}>
            {title}
          </Text>
          {badge ? (
            <View style={styles.badge}>
              <Text variant="bodyLarge" color={colors.primary}>
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        {subtitle ? (
          <Text variant="body" color={colors.textSecondary} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ??
        (onPress ? <Icon name="chevron-forward" size={20} color={colors.textSecondary} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 66,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  subtitle: { marginTop: 2 },
  badge: {
    backgroundColor: colors.primaryTint,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
});
