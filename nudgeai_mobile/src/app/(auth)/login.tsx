import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, OrDivider, Screen, SocialButtons, TextField } from '@/components/ui';
import { AuthHeader } from '@/features/auth/components/AuthHeader';
import { LinkText } from '@/features/auth/components/LinkText';
import { isValidEmail } from '@/lib/validation';
import { useAuthStore } from '@/store/useAuthStore';

export default function Login() {
  const router = useRouter();
  const signIn = useAuthStore((s) => s.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const emailError = submitted && !isValidEmail(email) ? 'Enter a valid email address' : undefined;
  const passwordError = submitted && !password ? 'Enter your password' : undefined;

  const submit = async () => {
    setSubmitted(true);
    if (!isValidEmail(email) || !password) return;
    setLoading(true);
    await signIn(email, password);
    router.replace('/home');
  };

  const social = async () => {
    setLoading(true);
    await signIn('', '');
    router.replace('/home');
  };

  return (
    <Screen scroll>
      <AuthHeader title="Welcome Back!" subtitle="Keep your streak alive. Let’s go." />
      <View style={styles.fields}>
        <TextField
          label="Email address"
          placeholder="Enter email address"
          value={email}
          onChangeText={setEmail}
          error={emailError}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <TextField
          label="Password"
          placeholder="Enter password"
          value={password}
          onChangeText={setPassword}
          error={passwordError}
          secure
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={submit}
        />
        <LinkText
          action="Forget password"
          align="right"
          onPress={() => router.push('/forgot-password')}
        />
      </View>
      <Button
        label="Log in"
        onPress={submit}
        loading={loading}
        style={styles.cta}
        testID="login-submit"
      />
      <View style={styles.switch}>
        <LinkText
          prefix="Don’t have an account?"
          action="Create account"
          onPress={() => router.replace('/signup')}
        />
      </View>
      <View style={styles.or}>
        <OrDivider />
      </View>
      <SocialButtons verb="Continue" onGoogle={social} onApple={social} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 22 },
  cta: { marginTop: 30 },
  switch: { marginTop: 16 },
  or: { marginVertical: 28 },
});
