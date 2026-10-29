import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  BottomSheet,
  Button,
  DateField,
  Icon,
  SelectField,
  Text,
  TextField,
  Toggle,
} from '@/components/ui';
import { useNow } from '@/hooks/useNow';
import { dateKey } from '@/lib/date';
import { TASK_TITLE_MAX, validateTaskTitle } from '@/lib/validation';
import { toast } from '@/store/useToastStore';
import { useTasksStore } from '@/store/useTasksStore';
import { colors, radius } from '@/theme';

import type { Task, TaskPriority } from '../types';
import { dueAt, formatClock } from '../utils';

import { priorityDotColor } from './PriorityBadge';

type TaskSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Pass a task to edit it; omit to create. Give the sheet a `key` per task so its form resets. */
  task?: Task;
  /** Shown as "Delete task" in edit mode. */
  onDelete?: (task: Task) => void;
};

const PRIORITIES: readonly TaskPriority[] = ['High', 'Medium', 'Low'];
export const ALL_DAY = 'all-day';

/** Half-hour slots from 6:00 am to 11:30 pm as "HH:mm" values, preceded by "All day". */
export const TIME_OPTIONS = [
  { label: 'All day', value: ALL_DAY },
  ...Array.from({ length: 36 }, (_, i) => {
    const minutes = 6 * 60 + i * 30;
    const value = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    return { label: formatClock(value), value };
  }),
];

export function TaskSheet({ visible, onClose, task, onDelete }: TaskSheetProps) {
  const addTask = useTasksStore((s) => s.addTask);
  const updateTask = useTasksStore((s) => s.updateTask);
  const editing = task !== undefined;
  const now = useNow();

  const [title, setTitle] = useState(task?.title ?? '');
  const [date, setDate] = useState(task?.date ?? dateKey());
  const [time, setTime] = useState<string>(task?.startTime ?? (editing ? ALL_DAY : '09:00'));
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'High');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [repeat, setRepeat] = useState(task?.repeat ?? false);

  const [touched, setTouched] = useState(false);
  const titleError = validateTaskTitle(title);
  const canSubmit = titleError === null;
  const startTime = time === ALL_DAY ? null : time;
  const inPast =
    startTime !== null && dueAt({ date, startTime, endTime: null }).getTime() < now.getTime();

  const reset = () => {
    if (editing) return;
    setTitle('');
    setTouched(false);
    setDate(dateKey());
    setTime('09:00');
    setPriority('High');
    setNotes('');
    setRepeat(false);
  };

  const close = () => {
    onClose();
    reset();
  };

  const submit = () => {
    if (!canSubmit) {
      setTouched(true);
      return;
    }
    const draft = { title, date, time: startTime, priority, notes, repeat };
    if (task) {
      updateTask(task.id, draft);
      toast.success('Task updated');
    } else {
      addTask(draft);
      toast.success('Task added');
    }
    close();
  };

  return (
    <BottomSheet
      visible={visible}
      title={editing ? 'Edit Task' : 'New Task'}
      onClose={close}
      footer={
        <View style={styles.footer}>
          {task && onDelete ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                close();
                onDelete(task);
              }}
              style={styles.delete}
            >
              <Icon name="trash-outline" size={20} color={colors.danger} />
              <Text variant="subheading" color={colors.danger}>
                Delete task
              </Text>
            </Pressable>
          ) : null}
          <Button
            label={editing ? 'Save changes' : 'Add task'}
            onPress={submit}
            disabled={!canSubmit}
            testID="task-submit"
          />
        </View>
      }
    >
      <TextField
        appearance="filled"
        label="Task Name"
        placeholder="e.g. finish case study deck"
        value={title}
        onChangeText={setTitle}
        onBlur={() => setTouched(true)}
        error={(touched || title.trim().length > 0) && titleError ? titleError : undefined}
        success={touched && !titleError}
        counter={`${title.trim().length}/${TASK_TITLE_MAX}`}
        autoFocus={!editing}
        maxLength={TASK_TITLE_MAX + 10}
        returnKeyType="done"
      />
      <DateField
        label="Date"
        value={date}
        onChange={setDate}
        minDate={editing ? undefined : dateKey()}
      />
      <View style={styles.timeGroup}>
        <SelectField
          label="Time"
          value={time}
          options={TIME_OPTIONS}
          onChange={setTime}
          icon="time-outline"
        />
        {inPast ? (
          <Text variant="bodyLarge" color={colors.danger}>
            That time has passed, so this will show as overdue.
          </Text>
        ) : (
          <Text variant="bodyLarge" color={colors.primary}>
            Nudge AI will remind you.
          </Text>
        )}
      </View>

      <View style={styles.group}>
        <Text variant="subheading" color={colors.textSecondary}>
          Priority
        </Text>
        <View style={styles.row}>
          {PRIORITIES.map((p) => (
            <Pressable
              key={p}
              accessibilityRole="button"
              accessibilityState={{ selected: p === priority }}
              onPress={() => setPriority(p)}
              style={[styles.priority, p === priority && { backgroundColor: colors.primaryTint }]}
            >
              <View style={[styles.dot, { backgroundColor: priorityDotColor[p] }]} />
              <Text variant="bodyLarge">{p}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <TextField
        appearance="filled"
        label="Notes (optional)"
        placeholder="Add context, links, or reminders,..."
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <View style={styles.repeat}>
        <Icon name="link-outline" size={22} color={colors.textSecondary} />
        <View style={styles.repeatTexts}>
          <Text variant="subheading">Repeat this task</Text>
          <Text variant="body" color={colors.textSecondary}>
            Make it a recurring reminder
          </Text>
        </View>
        <Toggle value={repeat} onValueChange={setRepeat} accessibilityLabel="Repeat this task" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  footer: { gap: 10 },
  delete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
  },
  timeGroup: { gap: 10 },
  group: { gap: 12 },
  row: { flexDirection: 'row', gap: 12 },
  priority: {
    flex: 1,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  dot: { width: 18, height: 18, borderRadius: 9 },
  repeat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  repeatTexts: { flex: 1, gap: 2 },
});
