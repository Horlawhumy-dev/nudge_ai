import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTabBarClearance } from '@/components/layout/useTabBarClearance';
import {
  AiOrb,
  Avatar,
  ConfirmDialog,
  GradientCard,
  Icon,
  ListRow,
  Screen,
  ScreenHeader,
  SectionCard,
  Text,
} from '@/components/ui';
import { ComingSoonDialog } from '@/features/settings/components/ComingSoonDialog';
import { useAuthStore } from '@/store/useAuthStore';
import { usePreferencesStore } from '@/store/usePreferencesStore';
import { colors, radius } from '@/theme';

export default function Profile() {
  const router = useRouter();
  const clearance = useTabBarClearance();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const plan = usePreferencesStore((s) => s.plan);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const planLabel = plan === 'pro' ? 'Pro' : 'Free';

  const logOut = () => {
    setConfirmLogout(false);
    signOut();
    router.replace('/');
  };

  return (
    <Screen
      scroll
      background={colors.background}
      bottomInset={clearance}
      contentStyle={styles.content}
    >
      <ScreenHeader
        title="My Profile"
        onBack={() => router.navigate('/home')}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={10}
            onPress={() => router.push('/settings')}
          >
            <Icon name="settings-outline" size={28} />
          </Pressable>
        }
      />

      <View style={styles.identity}>
        <Avatar size={72} />
        <View style={styles.identityTexts}>
          <Text variant="heading">{user?.name}</Text>
          <Text variant="bodyLarge" color={colors.textSecondary} numberOfLines={1}>
            {user?.email}
          </Text>
        </View>
        <View style={styles.planPill}>
          <Text variant="bodyLarge" color={colors.primary}>
            {planLabel}
          </Text>
        </View>
      </View>

      {plan === 'free' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Upgrade to Nudge Pro"
          onPress={() => router.push('/settings/subscription')}
        >
          <GradientCard style={styles.upgrade}>
            <AiOrb size={46} framed />
            <View style={styles.upgradeTexts}>
              <Text variant="heading" style={styles.upgradeTitle}>
                Upgrade to Nudge Pro
              </Text>
              <Text variant="body" color="rgba(255,255,255,0.92)">
                Unlock voice reminders & more
              </Text>
            </View>
            <Icon name="chevron-forward" size={22} color={colors.white} />
          </GradientCard>
        </Pressable>
      ) : null}

      <SectionCard>
        <ListRow
          title="Edit Profile"
          icon="person-outline"
          onPress={() => router.push('/settings/edit-profile')}
        />
        <ListRow
          title="Privacy & Security"
          icon="lock-closed-outline"
          onPress={() => setComingSoon('Privacy & Security')}
        />
        <ListRow
          title="Subscription"
          icon="card-outline"
          badge={planLabel}
          onPress={() => router.push('/settings/subscription')}
        />
        <ListRow
          title="AI Voice & Tone"
          icon={<AiOrb size={26} />}
          onPress={() => router.push('/settings/ai-voice')}
        />
        <ListRow
          title="Quiet hours"
          icon="time-outline"
          onPress={() => router.push('/settings/quiet-hours')}
        />
        <ListRow
          title="Log out"
          icon="log-out-outline"
          destructive
          onPress={() => setConfirmLogout(true)}
        />
      </SectionCard>

      <ConfirmDialog
        visible={confirmLogout}
        title="Are you sure you want to log out?"
        confirmLabel="Log out"
        onCancel={() => setConfirmLogout(false)}
        onConfirm={logOut}
      />
      <ComingSoonDialog feature={comingSoon} onClose={() => setComingSoon(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20, paddingTop: 8 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  identityTexts: { flex: 1, gap: 4 },
  planPill: {
    backgroundColor: colors.primaryTint,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  upgrade: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 24 },
  upgradeTexts: { flex: 1, gap: 4 },
  upgradeTitle: { color: colors.text },
});
