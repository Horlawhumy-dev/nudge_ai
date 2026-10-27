import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Icon, Screen, ScreenHeader, Text, TextField } from '@/components/ui';
import { ComingSoonDialog } from '@/features/settings/components/ComingSoonDialog';
import { isValidEmail } from '@/lib/validation';
import { useAuthStore } from '@/store/useAuthStore';
import { colors } from '@/theme';

export default function EditProfile() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('************');
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);

  const emailValid = isValidEmail(email);
  const canSave = name.trim().length > 1 && emailValid;

  const save = () => {
    if (!canSave) return;
    updateProfile({ name: name.trim(), email: email.trim() });
    router.back();
  };

  return (
    <Screen scroll background={colors.background} contentStyle={{ gap: 24, paddingTop: 8 }}>
      <ScreenHeader
        title="Edit Profile"
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
            disabled={!canSave}
            onPress={save}
            hitSlop={10}
          >
            <Text variant="subheading" color={canSave ? colors.primary : colors.textMuted}>
              Save
            </Text>
          </Pressable>
        }
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change photo"
        onPress={() => setPhotoNotice('Change photo')}
        style={styles.photo}
      >
        <Avatar size={72} />
        <View style={styles.camera}>
          <Icon name="camera-outline" size={24} color={colors.white} />
        </View>
      </Pressable>
      <TextField label="Full name" value={name} onChangeText={setName} autoCapitalize="words" />
      <TextField
        label="Email address"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        error={email && !emailValid ? 'Enter a valid email address' : undefined}
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secure
        autoCapitalize="none"
      />
      <ComingSoonDialog feature={photoNotice} onClose={() => setPhotoNotice(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { width: 72, height: 72, borderRadius: 36 },
  camera: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
