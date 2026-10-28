import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { DEMO_MODE } from '@/constants/env';
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
  const saveName = useAuthStore((s) => s.saveName);
  const changePhoto = useAuthStore((s) => s.changePhoto);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);
  const name = useField(user?.name ?? '', validateFullName);
  const email = useField(user?.email ?? '', validateEmail);
  const emailRef = useRef<TextInput>(null);

  // With an account on the server, changing the email needs a confirmation code (not built yet),
  // so only the static demo lets it be edited here.
  const emailEditable = DEMO_MODE;
  const dirty =
    name.value.trim() !== user?.name || (emailEditable && email.value.trim() !== user?.email);
  const canSave = dirty && name.valid && (email.valid || !emailEditable) && !saving;
  const guard = useDiscardGuard(dirty);

  const save = async () => {
    if (!canSave) {
      name.touch();
      email.touch();
      return;
    }
    const cleanName = name.value.trim().replace(/\s+/g, ' ');
    setSaving(true);
    try {
      await saveName(cleanName);
      if (emailEditable) updateProfile({ email: email.value.trim() });
      haptics.success();
      toast.success('Profile updated');
      guard.allowLeave();
      router.back();
    } catch (e) {
      haptics.warning();
      toast.error(e instanceof Error ? e.message : 'Couldn’t save your profile. Try again.');
      setSaving(false);
    }
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
        setUploading(0);
        try {
          await changePhoto(result.assets[0].uri, setUploading);
          toast.success('Profile photo updated');
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Couldn’t upload your photo. Try again.');
        } finally {
          setUploading(null);
        }
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
            onPress={() => void save()}
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
        disabled={uploading !== null}
        onPress={() => void pickPhoto()}
        style={styles.photo}
      >
        <UserAvatar size={84} />
        <View style={styles.camera}>
          {uploading === null ? (
            <Icon name="camera-outline" size={26} color={colors.white} />
          ) : (
            <Text variant="caption" color={colors.white}>
              {Math.round(uploading * 100)}%
            </Text>
          )}
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
        editable={emailEditable}
        onSubmitEditing={() => void save()}
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
