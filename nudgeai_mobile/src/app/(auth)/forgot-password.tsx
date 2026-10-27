import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackButton, Button, Screen, Text, TextField } from '@/components/ui';
import { isValidEmail } from '@/lib/validation';
import { useAuthStore } from '@/store/useAuthStore';
import { colors } from '@/theme';

export default function ForgotPassword() {
  const router = useRouter();
  const requestPasswordReset = useAuthStore((s) => s.requestPasswordReset);
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setSubmitted(true);
    if (!isValidEmail(email)) return;
    setLoading(true);
    await requestPasswordReset(email);
    setLoading(false);
    router.push({ pathname: '/verify', params: { flow: 'reset' } });
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
      <TextField
        label="Email address"
        placeholder="Enter email address"
        value={email}
        onChangeText={setEmail}
        error={submitted && !isValidEmail(email) ? 'Enter a valid email address' : undefined}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        onSubmitEditing={submit}
      />
      <Button label="Continue" onPress={submit} loading={loading} style={styles.cta} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: 28, marginBottom: 44 },
  subtitle: { marginTop: 8 },
  cta: { marginTop: 28 },
});
