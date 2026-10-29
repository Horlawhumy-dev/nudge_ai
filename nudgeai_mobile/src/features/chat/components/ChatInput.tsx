import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { colors, fonts, shadows } from '@/theme';

type ChatInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onVoice: () => void;
  /** Shows an attach-photo button when given (server accounts only). */
  onPhoto?: () => void;
  /** A photo waiting to be sent; the text typed meanwhile goes with it as instructions. */
  attachment?: string | null;
  onRemoveAttachment?: () => void;
  disabled?: boolean;
};

/** Pill input: waveform button (voice mode) when empty, purple send arrow once there's text. */
export function ChatInput({
  value,
  onChangeText,
  onSend,
  onVoice,
  onPhoto,
  attachment = null,
  onRemoveAttachment,
  disabled = false,
}: ChatInputProps) {
  const hasText = value.trim().length > 0;
  const canSend = hasText || attachment !== null;

  return (
    <View style={styles.wrap}>
      {attachment ? (
        <View style={styles.attached}>
          <Image
            source={{ uri: attachment }}
            style={styles.thumb}
            accessibilityLabel="Attached photo"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove photo"
            hitSlop={10}
            onPress={onRemoveAttachment}
            style={styles.remove}
          >
            <Icon name="close" size={14} color={colors.white} />
          </Pressable>
        </View>
      ) : null}
      <View style={styles.bar}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={attachment ? 'Add instructions (optional)' : 'Ask Nudge anything...'}
          placeholderTextColor={colors.textPlaceholder}
          style={styles.input}
          returnKeyType="send"
          onSubmitEditing={() => canSend && !disabled && onSend()}
          accessibilityLabel="Message Nudge"
        />
        {onPhoto && !canSend ? (
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
        {canSend ? (
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  attached: { alignSelf: 'flex-start', marginLeft: 8 },
  thumb: { width: 72, height: 72, borderRadius: 14, backgroundColor: colors.fill },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
