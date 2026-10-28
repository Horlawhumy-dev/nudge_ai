import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { AiOrb } from '@/components/ui';
import { colors, shadows } from '@/theme';

type AskNudgeButtonProps = {
  bottom: number;
  /** Which edge to sit on; the other tabs keep the right edge for their "+" button. */
  side?: 'left' | 'right';
};

/** Round Nudge AI shortcut shown on the tabs that don't have the Home "ask" bar. */
export function AskNudgeButton({ bottom, side = 'left' }: AskNudgeButtonProps) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ask Nudge AI"
      onPress={() => router.push('/chat')}
      style={({ pressed }) => [styles.base, { bottom, [side]: 20 }, pressed && { opacity: 0.85 }]}
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
