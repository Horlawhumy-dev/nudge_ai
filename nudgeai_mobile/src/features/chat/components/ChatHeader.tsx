import { Pressable, StyleSheet, View } from 'react-native';

import { AiOrb, BackButton, Icon, Text, type IconName } from '@/components/ui';

type HeaderAction = { icon: IconName; label: string; onPress: () => void };

type ChatHeaderProps = {
  title: string;
  /** Show the Nudge orb next to the title (text chat + history). */
  showOrb?: boolean;
  right?: readonly HeaderAction[];
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
        {right?.map((action) => (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            hitSlop={10}
            onPress={action.onPress}
          >
            <Icon name={action.icon} size={26} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 56 },
  center: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 18 },
  side: { minWidth: 46, flexDirection: 'row', gap: 14, justifyContent: 'flex-end' },
});
