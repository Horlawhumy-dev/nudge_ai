import { Pressable, StyleSheet, View } from 'react-native';

import { AiOrb, BackButton, Icon, Text } from '@/components/ui';

type ChatHeaderProps = {
  title: string;
  /** Show the Nudge orb next to the title (text chat + history). */
  showOrb?: boolean;
  right?: { icon: 'time-outline' | 'options-outline'; label: string; onPress: () => void };
};

export function ChatHeader({ title, showOrb = true, right }: ChatHeaderProps) {
  return (
    <View style={styles.row}>
      <BackButton />
      <View style={styles.center}>
        {showOrb ? <AiOrb size={42} framed /> : null}
        <Text variant="subheading" style={styles.title}>
          {title}
        </Text>
      </View>
      <View style={styles.side}>
        {right ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={right.label}
            hitSlop={10}
            onPress={right.onPress}
          >
            <Icon name={right.icon} size={26} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 56 },
  center: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 18 },
  side: { width: 46, alignItems: 'flex-end' },
});
