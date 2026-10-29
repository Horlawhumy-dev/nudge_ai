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
  Text,
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
import { colors } from '@/theme';

export default function Login() {
  const router = useRouter();
  const signIn = useAuthStore((s) => s.signIn);
  const { email: prefilled } = useLocalSearchParams<{ email?: string }>();
  const remembered = useAuthStore((s) => s.rememberedEmail);
  const forgetRememberedEmail = useAuthStore((s) => s.forgetRememberedEmail);
  // A returning user only types the password. An email passed in by another screen wins.
  const knownEmail = prefilled ? null : remembered;
  const email = useField(prefilled ?? '', validateEmail);
  const password = useField('', validatePasswordPresent);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  // Inactive until both fields are valid, like every other primary action.
  const canSubmit = (knownEmail !== null || email.valid) && password.valid;

  const attempt = async (emailValue: string, passwordValue: string) => {
    setFormError(null);
    setLoading(true);
    try {
      await signIn(emailValue, passwordValue);
      haptics.success();
      const name = firstName(useAuthStore.getState().user?.name ?? '');
      toast.success(name ? `Welcome back, ${name}!` : 'Welcome back!');
      // Someone who signed up but never finished setup continues there.
      router.replace(
        useAuthStore.getState().status === 'onboarding' ? '/onboarding/step-1' : '/home'
      );
    } catch (e) {
      haptics.warning();
      // The account exists but its email isn't confirmed yet: sign-in re-sent a code, so go and enter it.
      if (useAuthStore.getState().status === 'unverified') {
        toast.show(`Verify your email first. We sent a new code to ${emailValue.trim()}.`);
        router.push('/verify');
        setLoading(false);
        return;
      }
      setFormError(e instanceof AuthError ? e.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const submit = () => {
    if (!canSubmit || loading) {
      if (knownEmail === null) email.touch();
      password.touch();
      return;
    }
    void attempt(knownEmail ?? email.value, password.value);
  };

  return (
    <Screen scroll>
      <BackButton onPress={() => router.replace('/intro')} />
      <AuthHeader title="Welcome Back!" subtitle="Keep your streak alive. Let’s go." />
      <View style={styles.fields}>
        <FormError message={formError} />
        {knownEmail !== null ? (
          <View style={styles.known} accessibilityLabel={`Logging in as ${knownEmail}`}>
            <Text variant="body" color={colors.textSecondary}>
              Logging in as
            </Text>
            <Text variant="subheading" numberOfLines={1}>
              {knownEmail}
            </Text>
            <LinkText
              prefix="Not you?"
              action="Use a different account"
              onPress={() => {
                forgetRememberedEmail();
                setFormError(null);
              }}
            />
          </View>
        ) : (
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
        )}
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
          autoFocus={knownEmail !== null}
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
              forgetRememberedEmail();
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
  known: { gap: 4, alignItems: 'flex-start' },
  cta: { marginTop: 30 },
  demo: { marginTop: 14 },
  switch: { marginTop: 16 },
  or: { marginVertical: 28 },
});
