import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Icon } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { toast } from '@/store/useToastStore';
import { useTasksStore } from '@/store/useTasksStore';
import { colors, radius } from '@/theme';

import type { Task } from '../types';

import { TaskRow } from './TaskRow';
import { TaskSheet } from './TaskSheet';

type TaskListProps = {
  tasks: readonly Task[];
  /** Optional header node rendered above (section titles on the Tasks screen). */
  header?: ReactNode;
};

/** Task rows with swipe-to-delete (undoable) and tap-to-edit. */
export function TaskList({ tasks, header }: TaskListProps) {
  const toggleTask = useTasksStore((s) => s.toggleTask);
  const removeTask = useTasksStore((s) => s.removeTask);
  const restoreTask = useTasksStore((s) => s.restoreTask);
  const [editing, setEditing] = useState<Task | null>(null);

  const remove = (task: Task) => {
    const removed = removeTask(task.id);
    if (!removed) return;
    haptics.warning();
    toast.show('Task deleted', {
      action: { label: 'Undo', onPress: () => restoreTask(removed.task, removed.index) },
    });
  };

  return (
    <View style={styles.list}>
      {header}
      {tasks.map((task) => (
        <ReanimatedSwipeable
          key={task.id}
          overshootRight={false}
          friction={2}
          renderRightActions={() => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${task.title}`}
              onPress={() => remove(task)}
              style={styles.delete}
            >
              <Icon name="trash-outline" size={24} color={colors.danger} />
            </Pressable>
          )}
        >
          <TaskRow
            task={task}
            onToggle={() => toggleTask(task.id)}
            onPress={() => setEditing(task)}
          />
        </ReanimatedSwipeable>
      ))}
      <TaskSheet
        key={editing?.id ?? 'none'}
        visible={editing !== null}
        task={editing ?? undefined}
        onClose={() => setEditing(null)}
        onDelete={remove}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  delete: {
    width: 64,
    marginLeft: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
