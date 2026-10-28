import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AiOrb, Icon, Text } from '@/components/ui';
import { colors, shadows } from '@/theme';

/** Height the bar occupies, so screens can pad their content to clear it. */
export const ASK_BAR_HEIGHT = 60;

type AskNudgeBarProps = {
  bottom: number;
};

/** Docked above the tab bar on Home: tap to chat, or tap the mic to talk. */
export function AskNudgeBar({ bottom }: AskNudgeBarProps) {
  const router = useRouter();

  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ask Nudge AI"
        onPress={() => router.push('/chat')}
        style={({ pressed }) => [styles.bar, pressed && { opacity: 0.92 }]}
      >
        <AiOrb size={38} />
        <Text variant="bodyLarge" color={colors.textMuted} style={styles.hint} numberOfLines={1}>
          Ask Nudge anything…
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Talk to Nudge"
          hitSlop={6}
          onPress={() => router.push('/chat/voice')}
          style={styles.mic}
        >
          <Icon name="mic" size={20} color={colors.white} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 20, right: 20 },
  bar: {
    height: ASK_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 12,
    paddingRight: 10,
    borderRadius: ASK_BAR_HEIGHT / 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    ...shadows.card,
  },
  hint: { flex: 1 },
  mic: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
