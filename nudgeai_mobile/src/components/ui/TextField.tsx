import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, radius } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  error?: string;
  hint?: string;
  /** Adds a show/hide toggle and masks the value. */
  secure?: boolean;
  /** `pill` is the auth/onboarding look; `filled` is the sheet look. */
  appearance?: 'pill' | 'filled';
  containerStyle?: StyleProp<ViewStyle>;
};

export function TextField({
  label,
  error,
  hint,
  secure = false,
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
        <Text variant="subheading" style={styles.label} color={pill ? colors.text : colors.textSecondary}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          pill ? styles.pill : styles.filled,
          multiline && styles.multiline,
          pill && { borderColor: error ? colors.danger : focused ? colors.text : colors.border },
        ]}
      >
        <TextInput
          {...inputProps}
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
            <Icon name={revealed ? 'eye-outline' : 'eye-off-outline'} size={22} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" color={colors.danger} style={styles.note}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color={colors.textMuted} style={styles.note}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 10 },
  field: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 },
  pill: { height: 54, borderRadius: radius.pill, borderWidth: 1.5, backgroundColor: colors.surface },
  filled: { height: 48, borderRadius: radius.md, backgroundColor: colors.fill },
  multiline: { height: 96, alignItems: 'flex-start', paddingTop: 12 },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text, padding: 0 },
  inputMultiline: { height: '100%', textAlignVertical: 'top' },
  note: { marginTop: 6, marginLeft: 6 },
});
