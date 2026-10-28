import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { DEMO_EMAIL, DEMO_MODE, DEMO_PASSWORD } from '@/constants/env';
import { AuthHeader } from '@/features/auth/components/AuthHeader';
import { DemoHint } from '@/features/auth/components/DemoHint';
import { LinkText } from '@/features/auth/components/LinkText';
import { useField } from '@/hooks/useField';
import { firstName } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { validateEmail, validatePasswordPresent } from '@/lib/validation';
import { AuthError, useAuthStore } from '@/store/useAuthStore';
import { toast } from '@/store/useToastStore';

export default function Login() {
  const router = useRouter();
  const signIn = useAuthStore((s) => s.signIn);
  const { email: prefilled } = useLocalSearchParams<{ email?: string }>();
  const email = useField(prefilled ?? '', validateEmail);
  const password = useField('', validatePasswordPresent);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  // Inactive until both fields are valid, like every other primary action.
  const canSubmit = email.valid && password.valid;

  const attempt = async (emailValue: string, passwordValue: string) => {
    setFormError(null);
    setLoading(true);
    try {
      await signIn(emailValue, passwordValue);
      haptics.success();
      const name = firstName(useAuthStore.getState().user?.name ?? '');
      toast.success(name ? `Welcome back, ${name}!` : 'Welcome back!');
      router.replace('/home');
    } catch (e) {
      haptics.warning();
      setFormError(e instanceof AuthError ? e.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const submit = () => {
    if (!canSubmit || loading) {
      email.touch();
      password.touch();
      return;
    }
    void attempt(email.value, password.value);
  };

  return (
    <Screen scroll>
      <BackButton onPress={() => router.replace('/intro')} />
      <AuthHeader title="Welcome Back!" subtitle="Keep your streak alive. Let’s go." />
      <View style={styles.fields}>
        <FormError message={formError} />
        <TextField
          label="Email address"
          placeholder="Enter email address"
          {...email.props}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          blurOnSubmit={false}
        />
        <TextField
          label="Password"
          placeholder="Enter password"
          {...password.props}
          success={false}
          secure
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          inputRef={passwordRef}
          returnKeyType="go"
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
        disabled={!canSubmit}
        loading={loading}
        style={styles.cta}
        testID="login-submit"
      />
      {DEMO_MODE ? (
        <View style={styles.demo}>
          <DemoHint
            onPress={() => {
              email.setValue(DEMO_EMAIL);
              password.setValue(DEMO_PASSWORD);
              email.touch();
              setFormError(null);
            }}
          >
            {`Demo account: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`}
          </DemoHint>
        </View>
      ) : null}
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
      <SocialButtons
        verb="Continue"
        onGoogle={() => void attempt('', '')}
        onApple={() => void attempt('', '')}
        disabled={loading}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 22 },
  cta: { marginTop: 30 },
  demo: { marginTop: 14 },
  switch: { marginTop: 16 },
  or: { marginVertical: 28 },
});
