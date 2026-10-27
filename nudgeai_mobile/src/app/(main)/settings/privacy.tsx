import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';

import { ConfirmDialog, ListRow, Screen, ScreenHeader, SectionCard, Text } from '@/components/ui';
import { hasReminderPermission } from '@/services/notifications';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { toast } from '@/store/useToastStore';
import { colors } from '@/theme';

export default function PrivacyAndSecurity() {
  const router = useRouter();
  const email = useAuthStore((s) => s.user?.email ?? 'your email');
  const clearAllChats = useChatStore((s) => s.deleteAll);
  const chatCount = useChatStore((s) => s.conversations.length);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const refresh = useCallback(() => {
    void hasReminderPermission().then(setAllowed);
  }, []);

  // Re-check when returning from the system settings screen.
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (state) => state === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  return (
    <Screen scroll background={colors.background} contentStyle={{ gap: 18, paddingTop: 8 }}>
      <ScreenHeader title="Privacy & Security" />

      <SectionCard title="Account">
        <ListRow
          title="Change password"
          subtitle="Update the password you log in with"
          icon="key-outline"
          onPress={() => router.push('/settings/change-password')}
        />
      </SectionCard>

      <SectionCard title="Permissions">
        <ListRow
          title="Notifications"
          subtitle={
            allowed === null
              ? 'Checking…'
              : allowed
                ? 'Allowed'
                : 'Not allowed. Tap to open settings'
          }
          icon="notifications-outline"
          onPress={() => void Linking.openSettings()}
        />
      </SectionCard>

      <SectionCard title="Your data">
        <ListRow
          title="Download my data"
          subtitle="Get a copy of your habits, tasks and chats"
          icon="download-outline"
          onPress={() => toast.show(`We’ll email a copy of your data to ${email}.`)}
        />
        <ListRow
          title="Clear chat history"
          subtitle={chatCount === 0 ? 'No conversations saved' : `${chatCount} conversations saved`}
          icon="chatbubbles-outline"
          destructive
          onPress={() =>
            chatCount > 0 ? setConfirmClear(true) : toast.show('There’s no chat history to clear.')
          }
        />
      </SectionCard>

      <Text variant="caption" color={colors.textMuted} align="center">
        Your habits, tasks and chats are stored on this device in this version of Nudge.
      </Text>

      <ConfirmDialog
        visible={confirmClear}
        title="Clear chat history?"
        message="All saved conversations with Nudge AI will be removed."
        confirmLabel="Clear"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          clearAllChats();
          toast.success('Chat history cleared');
        }}
      />
    </Screen>
  );
}
