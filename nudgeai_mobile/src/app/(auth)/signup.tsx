import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import {
  BackButton,
  Button,
  FormError,
  OrDivider,
  Screen,
  SocialButtons,
  TextField,
} from '@/components/ui';
import { AuthHeader } from '@/features/auth/components/AuthHeader';
import { LinkText } from '@/features/auth/components/LinkText';
import { PasswordChecklist } from '@/features/auth/components/PasswordChecklist';
import { useField } from '@/hooks/useField';
import { haptics } from '@/lib/haptics';
import { validateEmail, validateFullName, validateNewPassword } from '@/lib/validation';
import { AuthError, useAuthStore } from '@/store/useAuthStore';
import { toast } from '@/store/useToastStore';

export default function SignUp() {
  const router = useRouter();
  const signUp = useAuthStore((s) => s.signUp);
  const signIn = useAuthStore((s) => s.signIn);
  const name = useField('', validateFullName);
  const email = useField('', validateEmail);
  const password = useField('', validateNewPassword);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const canSubmit = name.valid && email.valid && password.valid;

  const submit = async () => {
    if (!canSubmit || loading) {
      name.touch();
      email.touch();
      password.touch();
      return;
    }
    setFormError(null);
    setLoading(true);
    try {
      await signUp(name.value, email.value, password.value);
      haptics.success();
      toast.success(`Account created. We sent a code to ${email.value.trim()}.`);
      router.push('/verify');
    } catch (e) {
      haptics.warning();
      if (e instanceof AuthError && e.field === 'email') {
        email.setRemoteError(e.message);
        emailRef.current?.focus();
      } else {
        setFormError(
          e instanceof AuthError ? e.message : 'Something went wrong. Please try again.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const social = async () => {
    setLoading(true);
    try {
      await signIn('', '');
      router.replace('/home');
    } catch {
      setFormError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <BackButton onPress={() => router.replace('/intro')} />
      <AuthHeader title="Create Account" subtitle="Start building better habits today!" />
      <View style={styles.fields}>
        <FormError message={formError} />
        <TextField
          label="Full name"
          placeholder="Enter full name"
          {...name.props}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          blurOnSubmit={false}
          maxLength={50}
        />
        <TextField
          label="Email address"
          placeholder="Enter email address"
          {...email.props}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          inputRef={emailRef}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          blurOnSubmit={false}
        />
        <View>
          <TextField
            label="Password"
            placeholder="Create password"
            value={password.value}
            onChangeText={password.setValue}
            onBlur={password.touch}
            secure
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            inputRef={passwordRef}
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
          <PasswordChecklist password={password.value} showErrors={password.touched} />
        </View>
      </View>
      <Button
        label="Create account"
        onPress={() => void submit()}
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
      <SocialButtons
        verb="Sign Up"
        onGoogle={() => void social()}
        onApple={() => void social()}
        disabled={loading}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 20 },
  cta: { marginTop: 30 },
  switch: { marginTop: 16 },
  or: { marginVertical: 28 },
});
