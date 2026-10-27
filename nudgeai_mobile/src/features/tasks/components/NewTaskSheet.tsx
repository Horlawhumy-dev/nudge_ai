import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet, Button, Icon, SelectField, Text, TextField, Toggle } from '@/components/ui';
import { useTasksStore } from '@/store/useTasksStore';
import { colors, radius } from '@/theme';

import type { TaskPriority } from '../types';
import { formatClock } from '../utils';

import { priorityDotColor } from './PriorityBadge';

type NewTaskSheetProps = {
  visible: boolean;
  onClose: () => void;
};

const PRIORITIES: readonly TaskPriority[] = ['High', 'Medium', 'Low'];

/** Half-hour slots from 6:00 am to 11:30 pm as "HH:mm" values. */
const TIME_OPTIONS = Array.from({ length: 36 }, (_, i) => {
  const minutes = 6 * 60 + i * 30;
  const value = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return { label: formatClock(value), value };
});

/** "12052026" → "12/05/2026" as the user types. */
export function maskDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/');
}

export function NewTaskSheet({ visible, onClose }: NewTaskSheetProps) {
  const addTask = useTasksStore((s) => s.addTask);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>('High');
  const [notes, setNotes] = useState('');
  const [repeat, setRepeat] = useState(false);

  const canSubmit = title.trim().length > 0;

  const close = () => {
    onClose();
    setTitle('');
    setDate('');
    setTime(null);
    setPriority('High');
    setNotes('');
    setRepeat(false);
  };

  const submit = () => {
    if (!canSubmit) return;
    addTask({ title, date, time: time ?? '', priority, notes, repeat });
    close();
  };

  return (
    <BottomSheet
      visible={visible}
      title="New Task"
      onClose={close}
      footer={
        <Button label="Add task" onPress={submit} disabled={!canSubmit} testID="add-task-submit" />
      }
    >
      <TextField
        appearance="filled"
        label="Task Name"
        placeholder="e.g. finish case study deck"
        value={title}
        onChangeText={setTitle}
      />
      <TextField
        appearance="filled"
        label="Date"
        placeholder="dd/mm/yyyy"
        value={date}
        onChangeText={(t) => setDate(maskDate(t))}
        keyboardType="number-pad"
        trailing={<Icon name="calendar-outline" size={22} color={colors.textSecondary} />}
      />
      <View style={styles.timeGroup}>
        <SelectField
          label="Time"
          value={time}
          options={TIME_OPTIONS}
          onChange={setTime}
          icon="time-outline"
        />
        <Text variant="bodyLarge" color={colors.primary}>
          Nudge AI will remind you.
        </Text>
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
