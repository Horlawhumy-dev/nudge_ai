import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, OrDivider, Screen, SocialButtons, TextField } from '@/components/ui';
import { AuthHeader } from '@/features/auth/components/AuthHeader';
import { LinkText } from '@/features/auth/components/LinkText';
import { isStrongPassword, isValidEmail } from '@/lib/validation';
import { useAuthStore } from '@/store/useAuthStore';

export default function SignUp() {
  const router = useRouter();
  const signUp = useAuthStore((s) => s.signUp);
  const signIn = useAuthStore((s) => s.signIn);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({ email: false, password: false });
  const [loading, setLoading] = useState(false);

  const emailValid = isValidEmail(email);
  const passwordValid = isStrongPassword(password);
  const canSubmit = name.trim().length > 1 && emailValid && passwordValid;

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    await signUp(name, email, password);
    router.push('/verify');
    setLoading(false);
  };

  const social = async () => {
    setLoading(true);
    await signIn('', '');
    router.replace('/home');
  };

  return (
    <Screen scroll>
      <AuthHeader title="Create Account" subtitle="Start building better habits today!" />
      <View style={styles.fields}>
        <TextField
          label="Full name"
          placeholder="Enter full name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
        />
        <TextField
          label="Email address"
          placeholder="Enter email address"
          value={email}
          onChangeText={setEmail}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          error={touched.email && email && !emailValid ? 'Enter a valid email address' : undefined}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <TextField
          label="Password"
          placeholder="Create password"
          value={password}
          onChangeText={setPassword}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          error={
            touched.password && password && !passwordValid
              ? 'Min 8 characters, 1 special character, caps, number.'
              : undefined
          }
          secure
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
        />
      </View>
      <Button
        label="Create account"
        onPress={submit}
        disabled={!canSubmit}
        loading={loading}
        style={styles.cta}
        testID="signup-submit"
      />
      <View style={styles.switch}>
        <LinkText
          prefix="Already have an account?"
          action="Log in"
          onPress={() => router.replace('/login')}
        />
      </View>
      <View style={styles.or}>
        <OrDivider />
      </View>
      <SocialButtons verb="Sign Up" onGoogle={social} onApple={social} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 20 },
  cta: { marginTop: 30 },
  switch: { marginTop: 16 },
  or: { marginVertical: 28 },
});
