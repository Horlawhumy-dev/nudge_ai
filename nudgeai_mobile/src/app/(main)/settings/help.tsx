import { useRouter } from 'expo-router';
import { useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';

import { Button, EmptyState, Icon, Screen, ScreenHeader, Text, TextField } from '@/components/ui';
import { searchFaqs } from '@/features/settings/faq';
import { haptics } from '@/lib/haptics';
import { colors, radius } from '@/theme';

export default function Help() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const results = searchFaqs(query);

  const toggle = (id: string) => {
    haptics.select();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((current) => (current === id ? null : id));
  };

  return (
    <Screen scroll background={colors.background} contentStyle={styles.content}>
      <ScreenHeader title="Help & FAQ" subtitle="Quick answers about Nudge" />
      <TextField
        appearance="filled"
        placeholder="Search help"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        returnKeyType="search"
        trailing={<Icon name="search" size={20} color={colors.textSecondary} />}
      />

      {results.length === 0 ? (
        <View style={styles.empty}>
          <EmptyState
            icon="search-outline"
            title="No results"
            message="Try a different word, or send us your question."
          />
        </View>
      ) : (
        <View style={styles.list}>
          {results.map((faq) => {
            const expanded = open === faq.id;
            return (
              <Pressable
                key={faq.id}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => toggle(faq.id)}
                style={styles.item}
              >
                <View style={styles.question}>
                  <Text variant="subheading" style={styles.questionText}>
                    {faq.question}
                  </Text>
                  <Icon
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.textSecondary}
                  />
                </View>
                {expanded ? (
                  <Text variant="bodyLarge" color={colors.textSecondary} style={styles.answer}>
                    {faq.answer}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.contact}>
        <Text variant="subheading">Still need help?</Text>
        <Text variant="body" color={colors.textSecondary}>
          Tell us what’s going on and we’ll look into it.
        </Text>
        <Button
          label="Send feedback"
          variant="outline"
          onPress={() => router.push('/settings/feedback')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, paddingTop: 8 },
  list: { gap: 10 },
  item: {
    padding: 18,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  question: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  questionText: { flex: 1 },
  answer: { marginTop: 12 },
  empty: { marginTop: 24 },
  contact: { gap: 10, padding: 18, borderRadius: radius.xl, backgroundColor: colors.primarySoft },
});
