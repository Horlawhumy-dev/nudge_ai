import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';

import { AiOrb, Button, Screen, Text } from '@/components/ui';
import { remindersAvailable, requestReminderPermission } from '@/services/notifications';
import { usePreferencesStore } from '@/store/usePreferencesStore';
import { toast } from '@/store/useToastStore';
import { colors, radius } from '@/theme';

const BENEFITS = [
  { emoji: '⏰', title: 'Right on time', body: 'Reminders arrive when you said you’d like them.' },
  { emoji: '🌙', title: 'Quiet when you rest', body: 'Nothing during your sleep or quiet hours.' },
  { emoji: '🔥', title: 'Streak saves', body: 'A heads-up before a streak is at risk.' },
] as const;

/** Pre-prompt shown once, right after setup, before the OS permission dialog. */
export default function NotificationsStep() {
  const router = useRouter();
  const setNotification = usePreferencesStore((s) => s.setNotification);
  const [loading, setLoading] = useState(false);

  const enable = async () => {
    if (!remindersAvailable()) {
      setNotification('push', false);
      toast.show(
        'Reminders aren’t available in this environment. A development build supports them.'
      );
      router.replace('/onboarding/ready');
      return;
    }
    setLoading(true);
    const granted = await requestReminderPermission();
    setNotification('push', granted);
    setLoading(false);
    if (!granted) toast.show('You can turn notifications on later in Settings.');
    router.replace('/onboarding/ready');
  };

  const skip = () => {
    setNotification('push', false);
    router.replace('/onboarding/ready');
  };

  return (
    <Screen
      scroll
      footer={
        <View style={styles.footer}>
          <Button
            label="Turn on notifications"
            onPress={enable}
            loading={loading}
            testID="enable-notifications"
          />
          <Button label="Maybe later" variant="ghost" onPress={skip} />
        </View>
      }
    >
      <View style={styles.hero}>
        <AiOrb size={150} />
      </View>
      <Text variant="title" align="center">
        Never miss a nudge
      </Text>
      <Text variant="bodyLarge" color={colors.textSecondary} align="center" style={styles.subtitle}>
        Allow notifications so Nudge can remind you at the right moment.
      </Text>
      <View style={styles.list}>
        {BENEFITS.map((b) => (
          <View key={b.title} style={styles.row}>
            <View style={styles.tile}>
              <RNText style={styles.emoji}>{b.emoji}</RNText>
            </View>
            <View style={styles.texts}>
              <Text variant="subheading">{b.title}</Text>
              <Text variant="body" color={colors.textSecondary}>
                {b.body}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: 24, marginBottom: 8 },
  subtitle: { marginTop: 10, paddingHorizontal: 12 },
  list: { gap: 14, marginTop: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  tile: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 22 },
  texts: { flex: 1, gap: 2 },
  footer: { gap: 4 },
});
