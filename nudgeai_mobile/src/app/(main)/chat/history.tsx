import { useRouter } from 'expo-router';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { AiOrb, Icon, Screen, Text } from '@/components/ui';
import { ChatHeader } from '@/features/chat/components/ChatHeader';
import type { ConversationSummary } from '@/features/chat/types';
import { useChatStore } from '@/store/useChatStore';
import { colors, radius } from '@/theme';

function groupByDay(items: readonly ConversationSummary[]) {
  const groups: { title: string; data: ConversationSummary[] }[] = [];
  for (const item of items) {
    const group = groups.find((g) => g.title === item.group);
    if (group) group.data.push(item);
    else groups.push({ title: item.group, data: [item] });
  }
  return groups;
}

function ConversationRow({
  item,
  onDelete,
  onOpen,
}: {
  item: ConversationSummary;
  onDelete: () => void;
  onOpen: () => void;
}) {
  return (
    <ReanimatedSwipeable
      overshootRight={false}
      friction={2}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${item.title}`}
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
              {item.title}
            </Text>
            <Text variant="body" color={colors.textSecondary}>
              {item.time}
            </Text>
          </View>
          <Text variant="body" color={colors.textSecondary}>
            {item.messageCount} {item.messageCount === 1 ? 'message' : 'messages'} • {item.mode}
          </Text>
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  );
}

export default function ChatHistory() {
  const router = useRouter();
  const conversations = useChatStore((s) => s.conversations);
  const deleteConversation = useChatStore((s) => s.deleteConversation);

  return (
    <Screen background={colors.background}>
      <ChatHeader
        title="Chat History"
        right={{ icon: 'options-outline', label: 'Filter', onPress: () => undefined }}
      />
      <SectionList
        sections={groupByDay(conversations)}
        keyExtractor={(c) => c.id}
        renderSectionHeader={({ section }) => (
          <Text variant="bodyLarge" color={colors.textSecondary} style={styles.section}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <ConversationRow
            item={item}
            onDelete={() => deleteConversation(item.id)}
            onOpen={() => router.push('/chat')}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={
          <Text
            variant="bodyLarge"
            color={colors.textSecondary}
            align="center"
            style={styles.empty}
          >
            No conversations yet.
          </Text>
        }
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 24 },
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
