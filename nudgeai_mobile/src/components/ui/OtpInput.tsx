import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { colors, fonts, radius } from '@/theme';

import { Text } from './Text';

type OtpInputProps = {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
};

/** One hidden input drives N visual cells, so paste and autofill work. */
export function OtpInput({ length = 4, value, onChange, autoFocus = true }: OtpInputProps) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, length - 1);

  return (
    <Pressable onPress={() => inputRef.current?.focus()} accessibilityLabel="Verification code">
      <View style={styles.row}>
        {Array.from({ length }, (_, i) => {
          const isActive = focused && i === active;
          return (
            <View
              key={i}
              style={[
                styles.cell,
                isActive && { borderColor: colors.primary, backgroundColor: colors.primarySoft },
              ]}
            >
              <Text variant="heading">{value[i] ?? ''}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.hidden}
        caretHidden
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  cell: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1, fontFamily: fonts.body },
});
