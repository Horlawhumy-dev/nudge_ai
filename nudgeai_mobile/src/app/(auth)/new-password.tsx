import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackButton, Button, Screen, Text, TextField } from '@/components/ui';
import { PasswordChecklist } from '@/features/auth/components/PasswordChecklist';
import { isStrongPassword } from '@/lib/validation';
import { useAuthStore } from '@/store/useAuthStore';
import { colors } from '@/theme';

export default function NewPassword() {
  const router = useRouter();
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = isStrongPassword(password) && confirm === password;

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    await resetPassword(password);
    router.replace('/password-reset');
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
        <View>
          <TextField
            label="Password"
            placeholder="Enter password"
            value={password}
            onChangeText={setPassword}
            secure
            autoCapitalize="none"
            textContentType="newPassword"
          />
          <PasswordChecklist password={password} />
        </View>
        <TextField
          label="Confirm password"
          placeholder="Confirm password"
          value={confirm}
          onChangeText={setConfirm}
          secure
          autoCapitalize="none"
          textContentType="newPassword"
          error={mismatch ? 'Passwords don’t match' : undefined}
        />
      </View>
      <Button
        label="Reset password"
        onPress={submit}
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
