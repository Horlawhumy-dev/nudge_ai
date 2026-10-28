import { StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { checkPassword } from '@/lib/validation';
import { colors } from '@/theme';

const RULES = [
  { key: 'minLength', label: 'At least 8 characters' },
  { key: 'uppercase', label: 'One capital letter' },
  { key: 'number', label: 'One number' },
  { key: 'special', label: 'One special character' },
] as const;

/** Live rule list under a password field; hidden until the user starts typing. */
export function PasswordChecklist({
  password,
  showErrors = false,
}: {
  password: string;
  /** Mark unmet rules in red (after the user leaves the field or tries to submit). */
  showErrors?: boolean;
}) {
  if (!password) return null;
  const result = checkPassword(password);

  return (
    <View style={styles.list} accessibilityLabel="Password requirements">
      {RULES.map((rule) => {
        const ok = result[rule.key];
        return (
          <View key={rule.key} style={styles.row}>
            <Icon
              name={ok ? 'checkmark-circle' : showErrors ? 'close-circle' : 'ellipse-outline'}
              size={18}
              color={ok ? colors.success : showErrors ? colors.danger : colors.textDisabled}
            />
            <Text
              variant="body"
              color={ok ? colors.text : showErrors ? colors.danger : colors.textMuted}
            >
              {rule.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8, marginTop: 12, marginLeft: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
