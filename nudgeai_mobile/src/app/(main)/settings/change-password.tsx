import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, ScreenHeader, TextField } from '@/components/ui';
import { PasswordChecklist } from '@/features/auth/components/PasswordChecklist';
import { haptics } from '@/lib/haptics';
import { sleep } from '@/lib/format';
import { isStrongPassword } from '@/lib/validation';
import { toast } from '@/store/useToastStore';
import { colors } from '@/theme';

export default function ChangePassword() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== next;
  const same = next.length > 0 && next === current;
  const canSubmit = current.length > 0 && isStrongPassword(next) && confirm === next && !same;

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    await sleep(600);
    setLoading(false);
    haptics.success();
    toast.success('Password updated');
    router.back();
  };

  return (
    <Screen
      scroll
      background={colors.background}
      contentStyle={styles.content}
      footer={
        <Button label="Update password" onPress={submit} disabled={!canSubmit} loading={loading} />
      }
    >
      <ScreenHeader
        title="Change password"
        subtitle="Use a strong password you don’t use elsewhere."
      />
      <View style={styles.fields}>
        <TextField
          label="Current password"
          placeholder="Enter current password"
          value={current}
          onChangeText={setCurrent}
          secure
          autoCapitalize="none"
          textContentType="password"
        />
        <View>
          <TextField
            label="New password"
            placeholder="Enter new password"
            value={next}
            onChangeText={setNext}
            secure
            autoCapitalize="none"
            textContentType="newPassword"
            error={same ? 'New password must be different from the current one' : undefined}
          />
          <PasswordChecklist password={next} />
        </View>
        <TextField
          label="Confirm new password"
          placeholder="Confirm new password"
          value={confirm}
          onChangeText={setConfirm}
          secure
          autoCapitalize="none"
          textContentType="newPassword"
          error={mismatch ? 'Passwords don’t match' : undefined}
          onSubmitEditing={submit}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 24, paddingTop: 8 },
  fields: { gap: 22 },
});
