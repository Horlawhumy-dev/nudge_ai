import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BackButton, Button, Icon, OtpInput, Screen, Text } from '@/components/ui';
import { DEMO_CODE, DEMO_MODE } from '@/constants/env';
import { DemoHint } from '@/features/auth/components/DemoHint';
import { useCountdown } from '@/hooks/useCountdown';
import { formatCountdown } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { validateOtp } from '@/lib/validation';
import { AuthError, useAuthStore } from '@/store/useAuthStore';
import { toast } from '@/store/useToastStore';
import { colors } from '@/theme';

const CODE_LENGTH = 4;
const RESEND_SECONDS = 59;

/** Shared by sign-up verification and the forgot-password flow (`?flow=reset`). */
export default function Verify() {
  const router = useRouter();
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const email = useAuthStore((s) => s.pendingEmail ?? s.user?.email ?? '');
  const verifyEmail = useAuthStore((s) => s.verifyEmail);
  const verifyResetCode = useAuthStore((s) => s.verifyResetCode);
  const resendCode = useAuthStore((s) => s.resendCode);
  const requestPasswordReset = useAuthStore((s) => s.requestPasswordReset);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { remaining, isDone, restart } = useCountdown(RESEND_SECONDS);

  const submit = async (value: string = code) => {
    const problem = validateOtp(value, CODE_LENGTH);
    if (problem) {
      setError(problem);
      return;
    }
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      // The reset flow checks the code now and keeps it for the next screen; only sign-up
      // changes the session status.
      if (flow === 'reset') {
        await verifyResetCode(value);
        haptics.success();
        router.replace('/new-password');
        return;
      }
      const outcome = await verifyEmail(value);
      haptics.success();
      if (outcome === 'already-verified') {
        toast.show('Your email is already verified. Log in to continue.');
        router.replace({ pathname: '/login', params: { email } });
      } else {
        router.replace('/verified');
      }
    } catch (e) {
      haptics.warning();
      setError(e instanceof AuthError ? e.message : 'Something went wrong. Please try again.');
      setCode(''); // let them retype straight away
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <BackButton fallback={flow === 'reset' ? '/forgot-password' : '/signup'} />
      <View style={styles.header}>
        <Text variant="title">Verify your account</Text>
        <Text variant="bodyLarge" color={colors.textSecondary} style={styles.subtitle}>
          We just sent you an email to your registered email account
        </Text>
      </View>
      <Text variant="subheading" color={colors.textSecondary} style={styles.prompt}>
        Enter the security code we just sent to {email}
      </Text>
      <View style={styles.otp}>
        <OtpInput
          length={CODE_LENGTH}
          value={code}
          error={error !== null}
          onChange={(value) => {
            setCode(value);
            setError(null);
            // Submit as soon as the last digit lands, like a native one-time-code flow.
            if (value.length === CODE_LENGTH) void submit(value);
          }}
        />
        {error ? (
          <View style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            <Icon name="alert-circle" size={16} color={colors.danger} />
            <Text variant="caption" color={colors.danger} style={styles.errorText}>
              {error}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.resend}>
        <Text variant="bodyLarge" color={colors.textSecondary}>
          Didn’t receive code?{' '}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={!isDone}
          onPress={() => {
            setCode('');
            setError(null);
            restart(); // disable the button straight away so a double tap can't send twice
            const send = flow === 'reset' ? requestPasswordReset(email) : resendCode();
            send.then(
              () => toast.success(`New code sent to ${email}`),
              (e: unknown) => {
                // Too soon: the server says how long to wait. Any other failure: let them retry now.
                restart(e instanceof AuthError && e.retryAfter ? e.retryAfter : 0);
                toast.error(
                  e instanceof AuthError ? e.message : 'Couldn’t send a new code. Try again.'
                );
              }
            );
          }}
          hitSlop={8}
        >
          <Text variant="bodyLarge" color={isDone ? colors.primary : colors.textMuted}>
            {isDone ? 'Resend' : `Resend - ${formatCountdown(remaining)}`}
          </Text>
        </Pressable>
      </View>
      {DEMO_MODE ? (
        <View style={styles.demo}>
          <DemoHint
            onPress={() => void submit(DEMO_CODE)}
          >{`Demo mode: your code is ${DEMO_CODE}`}</DemoHint>
        </View>
      ) : null}
      <Button
        label="Verify"
        onPress={() => void submit()}
        disabled={code.length < CODE_LENGTH}
        loading={loading}
        style={styles.cta}
        testID="verify-submit"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: 28 },
  subtitle: { marginTop: 8, maxWidth: 280 },
  prompt: { marginTop: 36 },
  otp: { marginTop: 28, gap: 10 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { flex: 1 },
  resend: { flexDirection: 'row', marginTop: 24, alignItems: 'center' },
  demo: { marginTop: 18 },
  cta: { marginTop: 28 },
});
