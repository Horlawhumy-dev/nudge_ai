import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { Checkbox } from '@/features/habits/components/Checkbox';
import { colors } from '@/theme';

import type { Task } from '../types';
import { dayLabel, formatTimeRange, taskStatus } from '../utils';

import { PriorityBadge } from './PriorityBadge';

type TaskRowProps = {
  task: Task;
  onToggle: () => void;
  onPress: () => void;
};

export function TaskRow({ task, onToggle, onPress }: TaskRowProps) {
  const day = dayLabel(task);
  const overdue = taskStatus(task) === 'overdue';
  const time = formatTimeRange(task);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${task.title}, edit`}
      onPress={onPress}
      style={({ pressed }) => pressed && { opacity: 0.92 }}
    >
      <Card padding={16} radiusSize="lg" style={styles.card}>
        <Checkbox
          checked={task.done}
          onPress={onToggle}
          accessibilityLabel={`Mark ${task.title} ${task.done ? 'not done' : 'done'}`}
        />
        <View style={styles.texts}>
          <Text
            variant="subheading"
            numberOfLines={1}
            style={[styles.title, task.done && styles.done]}
            color={task.done ? colors.textMuted : colors.text}
          >
            {task.title}
          </Text>
          <Text
            variant="body"
            color={overdue ? colors.danger : colors.textSecondary}
            numberOfLines={1}
          >
            {day ? `${day} · ` : ''}
            {time}
          </Text>
        </View>
        <View style={styles.badge}>
          <PriorityBadge priority={task.priority} />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  texts: { flex: 1, gap: 4, paddingBottom: 2 },
  meta: { paddingRight: 84 },
  title: { fontSize: 17 },
  done: { textDecorationLine: 'line-through' },
  badge: { position: 'absolute', right: 14, bottom: 12 },
});
