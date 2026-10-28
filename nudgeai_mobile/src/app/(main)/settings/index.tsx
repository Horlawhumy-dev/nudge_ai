import { useRouter } from 'expo-router';
import { useState } from 'react';

import { DEMO_MODE } from '@/constants/env';
import { accountApi } from '@/services/api/endpoints/account';
import { ConfirmDialog, ListRow, Screen, ScreenHeader, SectionCard } from '@/components/ui';
import { RateDialog } from '@/features/settings/components/RateDialog';
import { ToggleRow } from '@/features/settings/components/ToggleRow';
import { useAuthStore } from '@/store/useAuthStore';
import { usePreferencesStore } from '@/store/usePreferencesStore';
import { toast } from '@/store/useToastStore';
import { colors } from '@/theme';

export default function Settings() {
  const router = useRouter();
  const habitStacking = usePreferencesStore((s) => s.habitStacking);
  const setPreferences = usePreferencesStore((s) => s.set);
  const signOut = useAuthStore((s) => s.signOut);
  const [rating, setRating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Screen scroll background={colors.background} contentStyle={{ gap: 18, paddingTop: 8 }}>
      <ScreenHeader title="Settings" />

      <SectionCard>
        <ListRow
          title="Notification"
          subtitle="Toggle push, voice reminders, morning summary"
          icon="notifications-outline"
          onPress={() => router.push('/settings/notifications')}
        />
      </SectionCard>

      <SectionCard title="Nudge AI">
        <ListRow
          title="Talk to Nudge"
          subtitle="Voice mode: just say what you need"
          icon="mic-outline"
          onPress={() => router.push('/chat/voice')}
        />
        <ListRow
          title="Chat with Nudge AI"
          subtitle="Ask, plan and reschedule by text"
          icon="chatbubble-ellipses-outline"
          onPress={() => router.push('/chat')}
        />
        <ListRow
          title="AI voice & tone"
          subtitle="Choose how your reminders sound"
          icon="color-wand-outline"
          onPress={() => router.push('/settings/ai-voice')}
        />
        <ListRow
          title="Chat history"
          icon="time-outline"
          onPress={() => router.push('/chat/history')}
        />
        <ListRow
          title="Weekly report"
          subtitle="Your week, summarised"
          icon="stats-chart-outline"
          onPress={() => router.push('/report')}
        />
      </SectionCard>

      <SectionCard title="Habits & tasks">
        <ListRow
          title="Wake up time"
          subtitle="Anchors morning habit reminders"
          icon="happy-outline"
          onPress={() => router.push('/settings/wake-time')}
        />
        <ListRow
          title="Sleep time"
          subtitle="Anchors evening habit reminders"
          icon="moon-outline"
          onPress={() => router.push('/settings/sleep-time')}
        />
        <ToggleRow
          title="Habit stacking"
          subtitle="Link habits to trigger each other"
          icon="link-outline"
          value={habitStacking}
          onValueChange={(v) => setPreferences({ habitStacking: v })}
        />
      </SectionCard>

      <SectionCard title="Support">
        <ListRow
          title="Help & FAQ"
          icon="help-circle-outline"
          onPress={() => router.push('/settings/help')}
        />
        <ListRow
          title="Send feedback"
          icon="chatbubbles-outline"
          onPress={() => router.push('/settings/feedback')}
        />
        <ListRow title="Rate Nudge" icon="star-outline" onPress={() => setRating(true)} />
      </SectionCard>

      <SectionCard title="Account">
        <ListRow
          title="Delete account"
          icon="trash-outline"
          destructive
          onPress={() => setConfirmDelete(true)}
        />
      </SectionCard>

      <RateDialog
        visible={rating}
        onClose={() => setRating(false)}
        onSubmit={(stars) => {
          if (!DEMO_MODE) {
            void accountApi.sendFeedback({ category: 'rating', stars }).catch(() => undefined);
          }
          toast.success(stars >= 4 ? 'Thanks for the love! 💜' : 'Thanks, we’ll keep improving.');
        }}
      />
      <ConfirmDialog
        visible={confirmDelete}
        title="Delete your account?"
        message="This removes your habits, tasks and chat history. It can’t be undone."
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          // A real account needs its password to be deleted; the demo just signs out.
          if (!DEMO_MODE) {
            router.push('/settings/delete-account');
            return;
          }
          void signOut();
          router.replace('/');
        }}
      />
    </Screen>
  );
}
