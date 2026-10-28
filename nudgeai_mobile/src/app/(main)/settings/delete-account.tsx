import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, FormError, Screen, ScreenHeader, Text, TextField } from '@/components/ui';
import { useField } from '@/hooks/useField';
import { haptics } from '@/lib/haptics';
import { validatePasswordPresent } from '@/lib/validation';
import { ApiError } from '@/services/api/errors';
import { useAuthStore } from '@/store/useAuthStore';
import { colors } from '@/theme';

/** Deleting an account is permanent, so it asks for the password first. */
export default function DeleteAccount() {
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const password = useField('', validatePasswordPresent);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!password.valid || loading) {
      password.touch();
      return;
    }
    setFormError(null);
    setLoading(true);
    try {
      await deleteAccount(password.value);
      haptics.success();
      // The session ends, so the signed-in area sends the user back to the start.
    } catch (e) {
      haptics.warning();
      if (e instanceof ApiError && [400, 401, 403].includes(e.status)) {
        password.setRemoteError(e.message);
      } else {
        setFormError(
          e instanceof Error ? e.message : 'We couldn’t delete your account. Try again.'
        );
      }
      setLoading(false);
    }
  };

  return (
    <Screen scroll background={colors.background} contentStyle={styles.content}>
      <ScreenHeader title="Delete account" />
      <Text variant="bodyLarge" color={colors.textSecondary}>
        This permanently removes your habits, tasks, chats and settings. It can’t be undone. Enter
        your password to confirm.
      </Text>
      <View style={styles.fields}>
        <FormError message={formError} />
        <TextField
          label="Password"
          placeholder="Enter your password"
          {...password.props}
          secure
          autoCapitalize="none"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
      </View>
      <Button
        label="Delete my account"
        variant="danger"
        onPress={() => void submit()}
        disabled={!password.valid}
        loading={loading}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 24, paddingTop: 8 },
  fields: { gap: 16 },
});
