import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { AiOrb, Screen, Text } from '@/components/ui';
import { ChatHeader } from '@/features/chat/components/ChatHeader';
import { ChatInput } from '@/features/chat/components/ChatInput';
import { MessageBubble } from '@/features/chat/components/MessageBubble';
import { QuickPrompts } from '@/features/chat/components/QuickPrompts';
import { TypingIndicator } from '@/features/chat/components/TypingIndicator';
import { displayName, useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { colors, fonts } from '@/theme';

export default function Chat() {
  const router = useRouter();
  const name = useAuthStore((s) => displayName(s.user));
  const messages = useChatStore((s) => s.messages);
  const isReplying = useChatStore((s) => s.isReplying);
  const send = useChatStore((s) => s.send);
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (messages.length > 0) listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length, isReplying]);

  const submit = () => {
    const text = draft;
    setDraft('');
    void send(text);
  };

  return (
    <Screen
      background={colors.background}
      footer={
        <View style={styles.footer}>
          {messages.length === 0 ? (
            <QuickPrompts onSelect={(p) => void send(p.label, p.emoji)} />
          ) : null}
          <ChatInput
            value={draft}
            onChangeText={setDraft}
            onSend={submit}
            onVoice={() => router.push('/chat/voice')}
            disabled={isReplying}
          />
        </View>
      }
    >
      <ChatHeader
        title="Nudge AI"
        right={{
          icon: 'time-outline',
          label: 'Chat history',
          onPress: () => router.push('/chat/history'),
        }}
      />

      {messages.length === 0 ? (
        <View style={styles.hello}>
          <AiOrb size={170} />
          <Text variant="title" color={colors.primary} style={styles.helloTitle}>
            Hi {name || 'there'}!
          </Text>
          <Text variant="bodyLarge" color={colors.textSecondary} style={styles.helloSub}>
            How can I help you?
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          ItemSeparatorComponent={Gap}
          ListFooterComponent={isReplying ? <TypingIndicator /> : null}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </Screen>
  );
}

const Gap = () => <View style={{ height: 22 }} />;

const styles = StyleSheet.create({
  footer: { gap: 18 },
  hello: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  helloTitle: { fontFamily: fonts.displayBold, fontSize: 28, marginTop: 4 },
  helloSub: { marginTop: 6, fontSize: 18 },
  list: { paddingTop: 24, paddingBottom: 12 },
});
