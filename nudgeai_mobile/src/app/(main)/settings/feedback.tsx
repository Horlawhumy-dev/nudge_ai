import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Chip, Screen, ScreenHeader, Text, TextField, Toggle } from '@/components/ui';
import { sleep } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { toast } from '@/store/useToastStore';
import { colors } from '@/theme';

const CATEGORIES = [
  { id: 'bug', label: 'Something’s broken', emoji: '🐞' },
  { id: 'idea', label: 'I have an idea', emoji: '💡' },
  { id: 'praise', label: 'I love it', emoji: '💜' },
  { id: 'other', label: 'Other', emoji: '💬' },
] as const;

const MIN_LENGTH = 10;
const MAX_LENGTH = 500;

export default function Feedback() {
  const router = useRouter();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['id']>('idea');
  const [message, setMessage] = useState('');
  const [includeInfo, setIncludeInfo] = useState(true);
  const [loading, setLoading] = useState(false);

  const canSubmit = message.trim().length >= MIN_LENGTH;

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    await sleep(700);
    setLoading(false);
    haptics.success();
    toast.success('Thanks! Your feedback helps shape Nudge.');
    router.back();
  };

  return (
    <Screen
      scroll
      background={colors.background}
      contentStyle={styles.content}
      footer={
        <Button label="Send feedback" onPress={submit} disabled={!canSubmit} loading={loading} />
      }
    >
      <ScreenHeader title="Send feedback" subtitle="Tell us what’s working and what isn’t." />

      <View style={styles.group}>
        <Text variant="subheading" color={colors.textSecondary}>
          What’s this about?
        </Text>
        <View style={styles.chips}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              label={`${c.emoji}  ${c.label}`}
              selected={category === c.id}
              onPress={() => setCategory(c.id)}
              style={styles.chip}
            />
          ))}
        </View>
      </View>

      <View>
        <TextField
          appearance="filled"
          label="Your message"
          placeholder="Describe what happened or what you’d like to see…"
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={MAX_LENGTH}
          containerStyle={styles.message}
        />
        <Text variant="caption" color={colors.textMuted} align="right" style={styles.counter}>
          {message.length}/{MAX_LENGTH}
        </Text>
      </View>

      <View style={styles.info}>
        <View style={styles.infoTexts}>
          <Text variant="subheading">Include app info</Text>
          <Text variant="body" color={colors.textSecondary}>
            App version and device type help us reproduce issues.
          </Text>
        </View>
        <Toggle
          value={includeInfo}
          onValueChange={setIncludeInfo}
          accessibilityLabel="Include app info"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 22, paddingTop: 8 },
  group: { gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { height: 42, paddingHorizontal: 16 },
  message: {},
  counter: { marginTop: 6 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  infoTexts: { flex: 1, gap: 2 },
});
