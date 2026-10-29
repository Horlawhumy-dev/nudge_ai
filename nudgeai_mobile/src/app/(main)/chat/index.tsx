import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { DEMO_MODE } from '@/constants/env';
import { toast } from '@/store/useToastStore';
import { AiOrb, Screen, Text } from '@/components/ui';
import { ChatHeader } from '@/features/chat/components/ChatHeader';
import { ChatInput } from '@/features/chat/components/ChatInput';
import { MessageBubble } from '@/features/chat/components/MessageBubble';
import { QuickPrompts } from '@/features/chat/components/QuickPrompts';
import { TypingIndicator } from '@/features/chat/components/TypingIndicator';
import { displayName, useAuthStore } from '@/store/useAuthStore';
import { selectMessages, useChatStore } from '@/store/useChatStore';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { colors, fonts } from '@/theme';

export default function Chat() {
  const router = useRouter();
  const name = useAuthStore((s) => displayName(s.user));
  const messages = useChatStore(selectMessages);
  const startNew = useChatStore((s) => s.startNew);
  const isReplying = useChatStore((s) => s.isReplying);
  const streaming = useChatStore((s) => s.streaming);
  const send = useChatStore((s) => s.send);
  const sendPhoto = useChatStore((s) => s.sendPhoto);
  const [draft, setDraft] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const keyboardVisible = useKeyboardVisible();
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();
  const sentPrompt = useRef(false);

  useEffect(() => {
    if (messages.length > 0) listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length, isReplying, keyboardVisible]);

  // Deep links (e.g. an insight card) can open the chat with a message already sent.
  useEffect(() => {
    if (!prompt || sentPrompt.current) return;
    sentPrompt.current = true;
    startNew();
    void send(prompt);
  }, [prompt, send, startNew]);

  const pickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.6,
      });
      if (!result.canceled && result.assets[0]) setPhoto(result.assets[0].uri); // wait for instructions
    } catch {
      toast.error('Couldn’t open your photos.');
    }
  };

  const submit = () => {
    const text = draft;
    setDraft('');
    if (photo) {
      const uri = photo;
      setPhoto(null);
      void sendPhoto(uri, text);
      return;
    }
    void send(text);
  };

  return (
    <Screen
      background={colors.background}
      footer={
        <View style={styles.footer}>
          {messages.length === 0 ? (
            <QuickPrompts onSelect={(p) => void send(p.label, { promptEmoji: p.emoji })} />
          ) : null}
          <ChatInput
            value={draft}
            onChangeText={setDraft}
            onSend={submit}
            onVoice={() => router.push('/chat/voice')}
            onPhoto={DEMO_MODE ? undefined : () => void pickPhoto()}
            attachment={photo}
            onRemoveAttachment={() => setPhoto(null)}
            disabled={isReplying}
          />
        </View>
      }
    >
      <ChatHeader
        title="Nudge AI"
        right={[
          ...(messages.length > 0
            ? [{ icon: 'create-outline' as const, label: 'New chat', onPress: startNew }]
            : []),
          {
            icon: 'time-outline',
            label: 'Chat history',
            onPress: () => router.push('/chat/history'),
          },
        ]}
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
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          keyboardDismissMode="interactive"
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          ItemSeparatorComponent={Gap}
          ListFooterComponent={isReplying && !streaming ? <TypingIndicator /> : null}
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
