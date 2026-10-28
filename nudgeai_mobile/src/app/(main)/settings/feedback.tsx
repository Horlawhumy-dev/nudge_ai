import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Chip,
  FormError,
  Screen,
  ScreenHeader,
  Text,
  TextField,
  Toggle,
} from '@/components/ui';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useField } from '@/hooks/useField';
import { sleep } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { FEEDBACK_MIN, validateFeedback } from '@/lib/validation';
import { toast } from '@/store/useToastStore';
import { colors } from '@/theme';

const CATEGORIES = [
  { id: 'bug', label: 'Something’s broken', emoji: '🐞' },
  { id: 'idea', label: 'I have an idea', emoji: '💡' },
  { id: 'praise', label: 'I love it', emoji: '💜' },
  { id: 'other', label: 'Other', emoji: '💬' },
] as const;

const MAX_LENGTH = 500;

export default function Feedback() {
  const router = useRouter();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['id']>('idea');
  const message = useField('', (v) => validateFeedback(v, FEEDBACK_MIN));
  const [includeInfo, setIncludeInfo] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const guard = useDiscardGuard(message.value.trim().length > 0 && !loading);

  const submit = async () => {
    if (!message.valid || loading) {
      message.touch();
      return;
    }
    setFormError(null);
    setLoading(true);
    try {
      await sleep(700);
      haptics.success();
      toast.success('Thanks! Your feedback helps shape Nudge.');
      guard.allowLeave();
      router.back();
    } catch {
      haptics.warning();
      setFormError('We couldn’t send your feedback. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Screen
      scroll
      background={colors.background}
      contentStyle={styles.content}
      footer={
        <Button
          label="Send feedback"
          onPress={() => void submit()}
          disabled={!message.valid}
          loading={loading}
        />
      }
    >
      <ScreenHeader title="Send feedback" subtitle="Tell us what’s working and what isn’t." />
      <FormError message={formError} />

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

      <TextField
        appearance="filled"
        label="Your message"
        placeholder="Describe what happened or what you’d like to see…"
        {...message.props}
        multiline
        maxLength={MAX_LENGTH}
        counter={`${message.value.length}/${MAX_LENGTH}`}
      />

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
      {guard.dialog}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 22, paddingTop: 8 },
  group: { gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { height: 42, paddingHorizontal: 16 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  infoTexts: { flex: 1, gap: 2 },
});
