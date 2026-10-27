import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BackButton, Button, OtpInput, Screen, Text } from '@/components/ui';
import { useCountdown } from '@/hooks/useCountdown';
import { formatCountdown } from '@/lib/format';
import { useAuthStore } from '@/store/useAuthStore';
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
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { remaining, isDone, restart } = useCountdown(RESEND_SECONDS);

  const submit = async (value: string = code) => {
    if (value.length < CODE_LENGTH || loading) return;
    setLoading(true);
    if (flow === 'reset') {
      router.replace('/new-password');
      return;
    }
    await verifyEmail(value);
    router.replace('/verified');
  };

  return (
    <Screen scroll>
      <BackButton />
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
          onChange={(value) => {
            setCode(value);
            // Submit as soon as the last digit lands, like a native one-time-code flow.
            if (value.length === CODE_LENGTH) void submit(value);
          }}
        />
      </View>
      <View style={styles.resend}>
        <Text variant="bodyLarge" color={colors.textSecondary}>
          Didn’t receive code?{' '}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={!isDone}
          onPress={() => {
            restart();
            setCode('');
            toast.show(`New code sent to ${email}`);
          }}
          hitSlop={8}
        >
          <Text variant="bodyLarge" color={colors.primary}>
            {isDone ? 'Resend' : `Resend - ${formatCountdown(remaining)}`}
          </Text>
        </Pressable>
      </View>
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
  otp: { marginTop: 28 },
  resend: { flexDirection: 'row', marginTop: 24, alignItems: 'center' },
  cta: { marginTop: 40 },
});
