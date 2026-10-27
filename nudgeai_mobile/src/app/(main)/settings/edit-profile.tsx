import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Screen, ScreenHeader, Text, TextField } from '@/components/ui';
import { UserAvatar } from '@/features/auth/components/UserAvatar';
import { haptics } from '@/lib/haptics';
import { isValidEmail } from '@/lib/validation';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from '@/store/useToastStore';
import { colors } from '@/theme';

export default function EditProfile() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');

  const emailValid = isValidEmail(email);
  const dirty = name.trim() !== user?.name || email.trim() !== user?.email;
  const canSave = dirty && name.trim().length > 1 && emailValid;

  const save = () => {
    if (!canSave) return;
    updateProfile({ name: name.trim(), email: email.trim() });
    haptics.success();
    toast.success('Profile updated');
    router.back();
  };

  const pickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });
      if (!result.canceled && result.assets[0]) {
        updateProfile({ avatarUri: result.assets[0].uri });
        toast.success('Profile photo updated');
      }
    } catch {
      toast.error('Couldn’t open your photos.');
    }
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
        onPress={() => void pickPhoto()}
        style={styles.photo}
      >
        <UserAvatar size={84} />
        <View style={styles.camera}>
          <Icon name="camera-outline" size={26} color={colors.white} />
        </View>
      </Pressable>
      <TextField
        label="Full name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        returnKeyType="next"
      />
      <TextField
        label="Email address"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        error={email && !emailValid ? 'Enter a valid email address' : undefined}
        onSubmitEditing={save}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/settings/change-password')}
        style={styles.password}
      >
        <Icon name="key-outline" size={20} color={colors.primary} />
        <Text variant="subheading" color={colors.primary}>
          Change password
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { width: 84, height: 84, borderRadius: 42 },
  camera: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 42,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  password: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
});
