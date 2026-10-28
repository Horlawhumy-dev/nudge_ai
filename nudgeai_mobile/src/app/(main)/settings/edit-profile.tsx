import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Icon, Screen, ScreenHeader, Text, TextField } from '@/components/ui';
import { UserAvatar } from '@/features/auth/components/UserAvatar';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useField } from '@/hooks/useField';
import { haptics } from '@/lib/haptics';
import { validateEmail, validateFullName } from '@/lib/validation';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from '@/store/useToastStore';
import { colors } from '@/theme';

export default function EditProfile() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const name = useField(user?.name ?? '', validateFullName);
  const email = useField(user?.email ?? '', validateEmail);
  const emailRef = useRef<TextInput>(null);

  const dirty = name.value.trim() !== user?.name || email.value.trim() !== user?.email;
  const canSave = dirty && name.valid && email.valid;
  const guard = useDiscardGuard(dirty);

  const save = () => {
    if (!canSave) {
      name.touch();
      email.touch();
      return;
    }
    updateProfile({ name: name.value.trim().replace(/\s+/g, ' '), email: email.value.trim() });
    haptics.success();
    toast.success('Profile updated');
    guard.allowLeave();
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
        {...name.props}
        autoCapitalize="words"
        autoComplete="name"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
        blurOnSubmit={false}
        maxLength={50}
      />
      <TextField
        label="Email address"
        {...email.props}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        inputRef={emailRef}
        returnKeyType="done"
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
      {guard.dialog}
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
