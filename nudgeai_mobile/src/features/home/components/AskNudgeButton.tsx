import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { AiOrb, Text } from '@/components/ui';
import { colors, shadows } from '@/theme';

type AskNudgeButtonProps = {
  bottom: number;
  /** Pill with a label (empty state) vs. just the orb. */
  expanded?: boolean;
};

export function AskNudgeButton({ bottom, expanded = false }: AskNudgeButtonProps) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ask Nudge AI"
      onPress={() => router.push('/chat')}
      style={({ pressed }) => [
        styles.base,
        expanded ? styles.pill : styles.round,
        { bottom },
        pressed && { opacity: 0.85 },
      ]}
    >
      <AiOrb size={expanded ? 48 : 40} framed={false} />
      {expanded ? <Text variant="subheading">Ask Nudge AI</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    position: 'absolute',
    right: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    flexDirection: 'row',
    ...shadows.card,
  },
  round: { width: 58, height: 58, borderRadius: 29, justifyContent: 'center' },
  pill: { height: 64, borderRadius: 32, paddingLeft: 10, paddingRight: 24, gap: 14 },
});
