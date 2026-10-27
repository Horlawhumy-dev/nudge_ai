import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';

import { colors } from '@/theme';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type EmptyStateProps = {
  icon: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  footnote?: string;
  children?: ReactNode;
};

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  footnote,
}: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Icon name={icon} size={34} color={colors.primary} />
      </View>
      <Text variant="title" align="center" style={styles.title}>
        {title}
      </Text>
      <Text variant="bodyLarge" color={colors.textSecondary} align="center">
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={styles.action} />
      ) : null}
      {footnote ? (
        <Text variant="body" color={colors.textMuted} align="center" style={styles.footnote}>
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: 24 },
  badge: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginTop: 24, marginBottom: 8, fontSize: 24 },
  action: { marginTop: 28, alignSelf: 'stretch', marginHorizontal: 40 },
  footnote: { marginTop: 16 },
});
