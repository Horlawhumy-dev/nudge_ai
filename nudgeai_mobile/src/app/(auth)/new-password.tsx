import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { BackButton, Button, FormError, Screen, Text, TextField } from '@/components/ui';
import { PasswordChecklist } from '@/features/auth/components/PasswordChecklist';
import { useField } from '@/hooks/useField';
import { haptics } from '@/lib/haptics';
import { validateConfirmPassword, validateNewPassword } from '@/lib/validation';
import { useAuthStore } from '@/store/useAuthStore';
import { colors } from '@/theme';

export default function NewPassword() {
  const router = useRouter();
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const password = useField('', validateNewPassword);
  const confirm = useField('', (v) => validateConfirmPassword(password.value, v));
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const confirmRef = useRef<TextInput>(null);

  const canSubmit = password.valid && confirm.valid;

  const submit = async () => {
    if (!canSubmit || loading) {
      password.touch();
      confirm.touch();
      return;
    }
    setFormError(null);
    setLoading(true);
    try {
      await resetPassword(password.value);
      haptics.success();
      router.replace('/password-reset');
    } catch {
      haptics.warning();
      setFormError('We couldn’t update your password. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <BackButton />
      <View style={styles.header}>
        <Text variant="title">Create new Password</Text>
        <Text variant="bodyLarge" color={colors.textSecondary} style={styles.subtitle}>
          Let’s create a new and strong password
        </Text>
      </View>
      <View style={styles.fields}>
        <FormError message={formError} />
        <View>
          <TextField
            label="Password"
            placeholder="Enter password"
            value={password.value}
            onChangeText={password.setValue}
            onBlur={password.touch}
            secure
            autoCapitalize="none"
            textContentType="newPassword"
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            blurOnSubmit={false}
          />
          <PasswordChecklist password={password.value} showErrors={password.touched} />
        </View>
        <TextField
          label="Confirm password"
          placeholder="Confirm password"
          {...confirm.props}
          secure
          autoCapitalize="none"
          textContentType="newPassword"
          inputRef={confirmRef}
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
      </View>
      <Button
        label="Reset password"
        onPress={() => void submit()}
        disabled={!canSubmit}
        loading={loading}
        style={styles.cta}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: 28, marginBottom: 44 },
  subtitle: { marginTop: 8 },
  fields: { gap: 20 },
  cta: { marginTop: 30 },
});
