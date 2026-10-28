import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { AiOrb } from '@/components/ui';
import { colors, shadows } from '@/theme';

/** Fab height (58) plus a gap, so the two buttons stack neatly. */
const FAB_STACK = 72;

type AskNudgeButtonProps = {
  bottom: number;
  /** Sit above a floating "+" button on the same edge (Habits and Tasks). */
  aboveFab?: boolean;
};

/** Round Nudge AI shortcut on the right of every tab. Tap to chat, press and hold to talk. */
export function AskNudgeButton({ bottom, aboveFab = false }: AskNudgeButtonProps) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ask Nudge AI"
      onPress={() => router.push('/chat')}
      onLongPress={() => router.push('/chat/voice')}
      accessibilityHint="Press and hold to talk"
      style={({ pressed }) => [
        styles.base,
        { bottom: aboveFab ? bottom + FAB_STACK : bottom, right: 20 },
        pressed && { opacity: 0.85 },
      ]}
    >
      <AiOrb size={40} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
});
