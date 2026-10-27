import { StyleSheet, View } from 'react-native';

import { Icon, Text, type IconName } from '@/components/ui';
import { colors } from '@/theme';

import type { TaskStatus } from '../types';

const ICON: Record<TaskStatus, { name: IconName; color: string; filled: boolean }> = {
  overdue: { name: 'time', color: colors.danger, filled: true },
  completed: { name: 'checkmark', color: colors.white, filled: true },
  upcoming: { name: 'pin', color: colors.danger, filled: false },
};

export function TaskSectionHeader({ status, title }: { status: TaskStatus; title: string }) {
  const icon = ICON[status];
  return (
    <View style={styles.row}>
      {status === 'completed' ? (
        <View style={[styles.disc, { backgroundColor: colors.success }]}>
          <Icon name={icon.name} size={16} color={icon.color} />
        </View>
      ) : (
        <Icon name={icon.name} size={status === 'overdue' ? 26 : 24} color={icon.color} />
      )}
      <Text variant="subheading" color={colors.textSecondary}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  disc: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
