import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet, Button, DateField, SelectField, Text, TextField } from '@/components/ui';
import { dateKey } from '@/lib/date';
import { TASK_TITLE_MAX, validateTaskTitle } from '@/lib/validation';
import { ALL_DAY, TIME_OPTIONS } from '@/features/tasks/components/TaskSheet';
import { priorityDotColor } from '@/features/tasks/components/PriorityBadge';
import type { TaskPriority } from '@/features/tasks/types';
import { colors, radius } from '@/theme';

import type { Proposal } from '../types';

export type TaskEdit = {
  title: string;
  date: string;
  start_time: string | null;
  priority: 'high' | 'medium' | 'low';
};

type Props = {
  proposal: Proposal;
  visible: boolean;
  onClose: () => void;
  /** Saves the edit; resolves to an error message or null. */
  onSave: (edit: TaskEdit) => Promise<string | null>;
};

const PRIORITIES: readonly TaskPriority[] = ['High', 'Medium', 'Low'];

/** The assistant's suggested task, with its day and time to check or change before it is added. */
export function ProposalEditSheet({ proposal, visible, onClose, onSave }: Props) {
  const args = proposal.args ?? {};
  const [title, setTitle] = useState(String(args.title ?? ''));
  // Today is shown when the assistant gave no day; saving is the person approving what they see.
  const [date, setDate] = useState(typeof args.date === 'string' ? args.date : dateKey());
  const [time, setTime] = useState(typeof args.start_time === 'string' ? args.start_time : ALL_DAY);
  const [priority, setPriority] = useState<TaskPriority>(
    args.priority === 'high' ? 'High' : args.priority === 'low' ? 'Low' : 'Medium'
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const titleError = validateTaskTitle(title);
  const canSave = titleError === null && !saving;

  const save = async () => {
    setSaving(true);
    const failed = await onSave({
      title: title.trim(),
      date,
      start_time: time === ALL_DAY ? null : time,
      priority: priority.toLowerCase() as TaskEdit['priority'],
    });
    setSaving(false);
    if (failed) setError(failed);
    else onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      title="Edit suggestion"
      onClose={onClose}
      footer={
        <Button
          label="Save"
          onPress={() => void save()}
          disabled={!canSave}
          testID="proposal-save"
        />
      }
    >
      <TextField
        appearance="filled"
        label="Task Name"
        value={title}
        onChangeText={setTitle}
        error={title.trim().length > 0 && titleError ? titleError : undefined}
        counter={`${title.trim().length}/${TASK_TITLE_MAX}`}
        maxLength={TASK_TITLE_MAX + 10}
      />
      <DateField label="Date" value={date} onChange={setDate} minDate={dateKey()} />
      <SelectField
        label="Time"
        value={time}
        options={TIME_OPTIONS}
        onChange={setTime}
        icon="time-outline"
      />
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
      {error ? (
        <Text variant="bodyLarge" color={colors.danger} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
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
});
