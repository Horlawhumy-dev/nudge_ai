import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, FormError, Screen, ScreenHeader, TextField } from '@/components/ui';
import { PasswordChecklist } from '@/features/auth/components/PasswordChecklist';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useField } from '@/hooks/useField';
import { sleep } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import {
  validateConfirmPassword,
  validateNewPassword,
  validatePasswordPresent,
} from '@/lib/validation';
import { toast } from '@/store/useToastStore';
import { colors } from '@/theme';

export default function ChangePassword() {
  const router = useRouter();
  const current = useField('', validatePasswordPresent);
  const next = useField('', (v) => {
    const problem = validateNewPassword(v);
    if (problem) return problem;
    return v === current.value ? 'Choose a password you haven’t used here before.' : null;
  });
  const confirm = useField('', (v) => validateConfirmPassword(next.value, v));
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nextRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const canSubmit = current.valid && next.valid && confirm.valid;
  const dirty = current.value + next.value + confirm.value !== '';
  const guard = useDiscardGuard(dirty && !loading);

  const submit = async () => {
    if (!canSubmit || loading) {
      current.touch();
      next.touch();
      confirm.touch();
      return;
    }
    setFormError(null);
    setLoading(true);
    try {
      await sleep(600);
      haptics.success();
      toast.success('Password updated');
      guard.allowLeave();
      router.back();
    } catch {
      haptics.warning();
      setFormError('We couldn’t update your password. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Screen
      scroll
      background={colors.background}
      contentStyle={styles.content}
      footer={
        <Button
          label="Update password"
          onPress={() => void submit()}
          disabled={!canSubmit}
          loading={loading}
        />
      }
    >
      <ScreenHeader
        title="Change password"
        subtitle="Use a strong password you don’t use elsewhere."
      />
      <View style={styles.fields}>
        <FormError message={formError} />
        <TextField
          label="Current password"
          placeholder="Enter current password"
          {...current.props}
          success={false}
          secure
          autoCapitalize="none"
          textContentType="password"
          returnKeyType="next"
          onSubmitEditing={() => nextRef.current?.focus()}
          blurOnSubmit={false}
        />
        <View>
          <TextField
            label="New password"
            placeholder="Enter new password"
            value={next.value}
            onChangeText={next.setValue}
            onBlur={next.touch}
            error={
              next.touched && next.error && next.error.startsWith('Choose') ? next.error : undefined
            }
            secure
            autoCapitalize="none"
            textContentType="newPassword"
            inputRef={nextRef}
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            blurOnSubmit={false}
          />
          <PasswordChecklist password={next.value} showErrors={next.touched} />
        </View>
        <TextField
          label="Confirm new password"
          placeholder="Confirm new password"
          {...confirm.props}
          secure
          autoCapitalize="none"
          textContentType="newPassword"
          inputRef={confirmRef}
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
      </View>
      {guard.dialog}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 24, paddingTop: 8 },
  fields: { gap: 22 },
});
