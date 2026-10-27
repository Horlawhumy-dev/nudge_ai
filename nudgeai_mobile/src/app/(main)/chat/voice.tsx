import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { Screen, Text } from '@/components/ui';
import { ChatHeader } from '@/features/chat/components/ChatHeader';
import { MessageBubble } from '@/features/chat/components/MessageBubble';
import { PulsingOrb } from '@/features/chat/components/PulsingOrb';
import { VoiceDock } from '@/features/chat/components/VoiceDock';
import { useVoiceSession, type VoicePhase } from '@/features/chat/useVoiceSession';
import { useChatStore } from '@/store/useChatStore';
import { colors, radius, shadows } from '@/theme';

const STATUS: Record<VoicePhase, string> = {
  listening: 'Listening...',
  paused: 'Paused',
  transcribing: 'Voice mode paused while generating',
  generating: 'Voice mode paused while generating',
  idle: 'Tap the mic to talk',
};

export default function Voice() {
  const router = useRouter();
  const messages = useChatStore((s) => s.messages);
  const clear = useChatStore((s) => s.clear);
  const { phase, transcript, toggleMic, togglePause } = useVoiceSession();

  const live = phase === 'listening' || phase === 'paused';
  const showOrb = live;
  const busy = phase === 'transcribing' || phase === 'generating';

  return (
    <Screen
      background={colors.background}
      contentStyle={styles.content}
      overlay={
        <View style={styles.dock} pointerEvents="box-none">
          <VoiceDock
            status={STATUS[phase]}
            micLabel={live ? 'Stop listening' : 'Start listening'}
            onMic={toggleMic}
            left={
              live
                ? {
                    icon: phase === 'paused' ? 'play' : 'pause',
                    label: phase === 'paused' ? 'Resume' : 'Pause',
                    onPress: togglePause,
                  }
                : { icon: 'trash-outline', label: 'Clear conversation', onPress: clear }
            }
            right={{ icon: 'close', label: 'Close voice mode', onPress: () => router.back() }}
          />
        </View>
      }
    >
      <ChatHeader
        title="Nudge voice"
        showOrb={false}
        right={{
          icon: 'time-outline',
          label: 'Chat history',
          onPress: () => router.push('/chat/history'),
        }}
      />

      {showOrb ? (
        <View style={styles.orbWrap}>
          <PulsingOrb size={300} active={phase === 'listening'} />
          <Text variant="bodyMedium" align="center" style={styles.transcript}>
            {transcript.heard}
            {transcript.pending ? (
              <Text variant="bodyMedium" color={colors.border} style={styles.transcript}>
                {transcript.heard ? ' ' : ''}
                {transcript.pending}
              </Text>
            ) : null}
          </Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          ItemSeparatorComponent={() => <View style={{ height: 22 }} />}
          ListFooterComponent={
            <View style={styles.footerItems}>
              {phase === 'generating' ? (
                <View style={styles.generating}>
                  <Text variant="bodyLarge" color={colors.textMuted}>
                    Generate loading
                  </Text>
                  <ActivityIndicator size="small" color={colors.textMuted} />
                </View>
              ) : null}
              {phase === 'transcribing' ? (
                <View style={styles.pending}>
                  <Text variant="bodyLarge">Transcribing...</Text>
                </View>
              ) : null}
            </View>
          }
          contentContainerStyle={[styles.list, busy && styles.listBusy]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 0 },
  orbWrap: { flex: 1, alignItems: 'center', paddingTop: 50 },
  transcript: { marginTop: 36, paddingHorizontal: 12, fontSize: 21, lineHeight: 30 },
  list: { paddingTop: 24, paddingBottom: 260 },
  listBusy: { paddingBottom: 260 },
  footerItems: { gap: 18, marginTop: 14 },
  generating: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pending: {
    alignSelf: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
