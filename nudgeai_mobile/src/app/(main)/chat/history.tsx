import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { AiOrb, EmptyState, Icon, Screen, Text } from '@/components/ui';
import { ChatHeader } from '@/features/chat/components/ChatHeader';
import type { Conversation } from '@/features/chat/types';
import {
  conversationMode,
  conversationTitle,
  formatTime,
  groupConversations,
} from '@/features/chat/utils';
import { useNow } from '@/hooks/useNow';
import { haptics } from '@/lib/haptics';
import { useChatStore } from '@/store/useChatStore';
import { toast } from '@/store/useToastStore';
import { colors, radius } from '@/theme';
import { usePullRefresh } from '@/hooks/usePullRefresh';
import { refreshData } from '@/services/sync';

function ConversationRow({
  item,
  onDelete,
  onOpen,
}: {
  item: Conversation;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const count = item.messages.length;
  return (
    <ReanimatedSwipeable
      overshootRight={false}
      friction={2}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${conversationTitle(item)}`}
          onPress={onDelete}
          style={styles.delete}
        >
          <Icon name="trash-outline" size={26} color={colors.danger} />
        </Pressable>
      )}
    >
      <Pressable accessibilityRole="button" onPress={onOpen} style={styles.card}>
        <AiOrb size={44} framed />
        <View style={styles.texts}>
          <View style={styles.titleRow}>
            <Text variant="subheading" numberOfLines={2} style={styles.title}>
              {conversationTitle(item)}
            </Text>
            <Text variant="body" color={colors.textSecondary}>
              {formatTime(item.createdAt)}
            </Text>
          </View>
          <Text variant="body" color={colors.textSecondary}>
            {count} {count === 1 ? 'message' : 'messages'} • {conversationMode(item)}
          </Text>
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  );
}

export default function ChatHistory() {
  const router = useRouter();
  const now = useNow();
  const pull = usePullRefresh(refreshData);
  const conversations = useChatStore((s) => s.conversations);
  const openConversation = useChatStore((s) => s.openConversation);
  const startNew = useChatStore((s) => s.startNew);
  const deleteConversation = useChatStore((s) => s.deleteConversation);

  const sections = groupConversations(conversations, now).map((g) => ({
    title: g.title,
    data: g.items,
  }));

  const remove = (item: Conversation) => {
    haptics.warning();
    deleteConversation(item.id);
    toast.show('Conversation deleted', {
      action: {
        label: 'Undo',
        onPress: () =>
          useChatStore.setState((s) => ({ conversations: [...s.conversations, item] })),
      },
    });
  };

  return (
    <Screen background={colors.background}>
      <ChatHeader
        title="Chat History"
        right={[
          {
            icon: 'create-outline',
            label: 'New chat',
            onPress: () => {
              startNew();
              router.dismissTo('/chat');
            },
          },
        ]}
      />
      <SectionList
        sections={sections}
        refreshControl={
          <RefreshControl
            refreshing={pull.refreshing}
            onRefresh={() => void pull.onRefresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        keyExtractor={(c) => c.id}
        renderSectionHeader={({ section }) => (
          <Text variant="bodyLarge" color={colors.textSecondary} style={styles.section}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <ConversationRow
            item={item}
            onDelete={() => remove(item)}
            onOpen={() => {
              openConversation(item.id);
              router.dismissTo('/chat');
            }}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <EmptyState
              icon="chatbubbles-outline"
              title="No conversations yet"
              message="Ask Nudge AI to summarise your day or reschedule a task and it will show up here."
              actionLabel="Start a chat"
              onAction={() => {
                startNew();
                router.dismissTo('/chat');
              }}
            />
          </View>
        }
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 24, flexGrow: 1 },
  section: { marginTop: 22, marginBottom: 12 },
  card: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
  },
  texts: { flex: 1, gap: 6 },
  titleRow: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  title: { flex: 1, fontSize: 16 },
  delete: {
    width: 72,
    marginLeft: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { marginTop: 80 },
});
