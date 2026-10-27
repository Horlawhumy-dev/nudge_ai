import { StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { Checkbox } from '@/features/habits/components/Checkbox';
import { colors } from '@/theme';

import type { Task } from '../types';

import { PriorityBadge } from './PriorityBadge';

type TaskRowProps = {
  task: Task;
  onToggle: () => void;
};

export function TaskRow({ task, onToggle }: TaskRowProps) {
  const time = task.endTime ? `${task.startTime} - ${task.endTime}` : task.startTime;

  return (
    <Card padding={16} radiusSize="lg" style={styles.card}>
      <Checkbox
        checked={task.done}
        onPress={onToggle}
        accessibilityLabel={`Mark ${task.title} ${task.done ? 'not done' : 'done'}`}
      />
      <View style={styles.texts}>
        <Text variant="subheading" numberOfLines={1} style={styles.title}>
          {task.title}
        </Text>
        <Text variant="body" color={colors.textSecondary}>
          {time}
        </Text>
      </View>
      <View style={styles.badge}>
        <PriorityBadge priority={task.priority} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  texts: { flex: 1, gap: 4, paddingBottom: 2 },
  title: { fontSize: 17 },
  badge: { position: 'absolute', right: 14, bottom: 12 },
});
