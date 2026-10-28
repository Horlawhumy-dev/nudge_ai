import { useState, type ReactNode, type Ref } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, fonts, radius } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  error?: string;
  /** Valid and checked: shows a green tick at the edge. */
  success?: boolean;
  hint?: string;
  /** e.g. "12/40"; shown at the right under the field. */
  counter?: string;
  /** Adds a show/hide toggle and masks the value. */
  secure?: boolean;
  /** Icon or control shown at the right edge (e.g. a calendar glyph). */
  trailing?: ReactNode;
  /** Ref to the underlying TextInput, for moving focus between fields. */
  inputRef?: Ref<TextInput>;
  /** `pill` is the auth/onboarding look; `filled` is the sheet look. */
  appearance?: 'pill' | 'filled';
  containerStyle?: StyleProp<ViewStyle>;
};

export function TextField({
  label,
  error,
  success = false,
  hint,
  counter,
  secure = false,
  trailing,
  inputRef,
  appearance = 'pill',
  multiline,
  containerStyle,
  onFocus,
  onBlur,
  ...inputProps
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const pill = appearance === 'pill';

  return (
    <View style={containerStyle}>
      {label ? (
        <Text
          variant="subheading"
          style={styles.label}
          color={pill ? colors.text : colors.textSecondary}
        >
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          pill ? styles.pill : styles.filled,
          multiline && styles.multiline,
          pill && {
            borderColor: error
              ? colors.danger
              : focused
                ? colors.text
                : success
                  ? colors.success
                  : colors.border,
          },
          !pill && error && styles.filledError,
        ]}
      >
        <TextInput
          {...inputProps}
          ref={inputRef}
          multiline={multiline}
          secureTextEntry={secure && !revealed}
          placeholderTextColor={colors.textPlaceholder}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, multiline && styles.inputMultiline]}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            hitSlop={12}
            onPress={() => setRevealed((v) => !v)}
          >
            <Icon
              name={revealed ? 'eye-outline' : 'eye-off-outline'}
              size={22}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
        {success && !error && !secure ? (
          <Icon name="checkmark-circle" size={22} color={colors.success} />
        ) : null}
        {trailing}
      </View>
      {error ? (
        <View style={styles.noteRow} accessibilityLiveRegion="polite" accessibilityRole="alert">
          <Icon name="alert-circle" size={16} color={colors.danger} />
          <Text variant="caption" color={colors.danger} style={styles.noteText}>
            {error}
          </Text>
        </View>
      ) : hint || counter ? (
        <View style={styles.noteRow}>
          {hint ? (
            <Text variant="caption" color={colors.textMuted} style={styles.noteText}>
              {hint}
            </Text>
          ) : (
            <View style={styles.noteText} />
          )}
          {counter ? (
            <Text variant="caption" color={colors.textMuted}>
              {counter}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 10 },
  field: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 },
  pill: {
    height: 54,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
  },
  filled: { height: 48, borderRadius: radius.md, backgroundColor: colors.fill },
  multiline: { height: 96, alignItems: 'flex-start', paddingTop: 12 },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
    padding: 0,
    ...Platform.select({ web: { outlineStyle: 'none' } as object }),
  },
  inputMultiline: { height: '100%', textAlignVertical: 'top' },
  filledError: { borderWidth: 1.5, borderColor: colors.danger },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    marginHorizontal: 6,
  },
  noteText: { flex: 1 },
});
