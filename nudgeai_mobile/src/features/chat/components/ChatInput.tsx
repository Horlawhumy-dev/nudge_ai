import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/ui';
import { colors, fonts, shadows } from '@/theme';

type ChatInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onVoice: () => void;
  /** Shows an attach-photo button when given (server accounts only). */
  onPhoto?: () => void;
  disabled?: boolean;
};

/** Pill input: waveform button (voice mode) when empty, purple send arrow once there's text. */
export function ChatInput({
  value,
  onChangeText,
  onSend,
  onVoice,
  onPhoto,
  disabled = false,
}: ChatInputProps) {
  const hasText = value.trim().length > 0;

  return (
    <View style={styles.bar}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Ask Nudge anything..."
        placeholderTextColor={colors.textPlaceholder}
        style={styles.input}
        returnKeyType="send"
        onSubmitEditing={() => hasText && !disabled && onSend()}
        accessibilityLabel="Message Nudge"
      />
      {onPhoto && !hasText ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add tasks from a photo"
          disabled={disabled}
          hitSlop={10}
          onPress={onPhoto}
          style={disabled && { opacity: 0.5 }}
        >
          <Icon name="image-outline" size={24} />
        </Pressable>
      ) : null}
      {hasText ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          disabled={disabled}
          onPress={onSend}
          style={[styles.send, disabled && { opacity: 0.5 }]}
        >
          <Icon name="arrow-up" size={22} color={colors.white} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start voice mode"
          hitSlop={10}
          onPress={onVoice}
        >
          <Icon name="pulse" size={24} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 64,
    paddingLeft: 24,
    paddingRight: 14,
    borderRadius: 32,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    ...shadows.card,
  },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.text, padding: 0 },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
