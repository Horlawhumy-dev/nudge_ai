import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { Card, Chip, Icon, ProgressBar, Text } from '@/components/ui';
import { colors } from '@/theme';

import { habitProgress } from '../utils';
import type { Habit } from '../types';

import { Checkbox } from './Checkbox';

type HabitCardProps = {
  habit: Habit;
  onToggle: () => void;
  onMenu: () => void;
};

export function HabitCard({ habit, onToggle, onMenu }: HabitCardProps) {
  const accent = colors.accents[habit.accentIndex % colors.accents.length];

  return (
    <Card padding={18} radiusSize="xl" style={styles.card}>
      <View style={styles.top}>
        <Checkbox
          checked={habit.completedToday}
          onPress={onToggle}
          accessibilityLabel={`Mark ${habit.name} ${habit.completedToday ? 'not done' : 'done'}`}
        />
        <RNText style={styles.emoji}>{habit.emoji}</RNText>
        <Text variant="subheading" style={styles.name} numberOfLines={1}>
          {habit.name}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Options for ${habit.name}`}
          hitSlop={12}
          onPress={onMenu}
        >
          <Icon name="ellipsis-vertical" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>
      <View style={styles.indent}>
        <View style={styles.goal}>
          <Text variant="body" color={colors.textSecondary}>
            {habit.frequency === 'Daily' ? 'Daily goal' : `${habit.frequency} goal`}
          </Text>
          <Text variant="body" color={colors.textSecondary}>
            {habit.daysDone}/{habit.goalDays} days
          </Text>
        </View>
        <ProgressBar progress={habitProgress(habit)} color={accent} />
        <View style={styles.tags}>
          <Chip label={habit.category} size="tag" selected />
          <Chip label={habit.timeOfDay} size="tag" tone="grey" />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { fontSize: 22 },
  name: { flex: 1, fontSize: 17 },
  indent: { marginLeft: 38, gap: 10 },
  goal: { flexDirection: 'row', justifyContent: 'space-between' },
  tags: { flexDirection: 'row', gap: 10, marginTop: 2 },
});
