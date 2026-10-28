import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackButton, Button, FormError, Screen, Text, TextField } from '@/components/ui';
import { useField } from '@/hooks/useField';
import { haptics } from '@/lib/haptics';
import { validateEmail } from '@/lib/validation';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from '@/store/useToastStore';
import { colors } from '@/theme';

export default function ForgotPassword() {
  const router = useRouter();
  const requestPasswordReset = useAuthStore((s) => s.requestPasswordReset);
  const email = useField('', validateEmail);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.valid || loading) {
      email.touch();
      return;
    }
    setFormError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email.value);
      haptics.success();
      toast.success(`We sent a code to ${email.value.trim()}.`);
      router.push({ pathname: '/verify', params: { flow: 'reset' } });
    } catch {
      haptics.warning();
      setFormError('We couldn’t send the code. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <BackButton />
      <View style={styles.header}>
        <Text variant="title">Forgot Password</Text>
        <Text variant="bodyLarge" color={colors.textSecondary} style={styles.subtitle}>
          Enter your email address to verify your account.
        </Text>
      </View>
      <View style={styles.fields}>
        <FormError message={formError} />
        <TextField
          label="Email address"
          placeholder="Enter email address"
          {...email.props}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
      </View>
      <Button
        label="Continue"
        onPress={() => void submit()}
        disabled={!email.valid}
        loading={loading}
        style={styles.cta}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: 28, marginBottom: 44 },
  subtitle: { marginTop: 8 },
  fields: { gap: 16 },
  cta: { marginTop: 28 },
});
