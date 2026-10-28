import { Image } from 'expo-image';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ListRow, Screen, ScreenHeader, SectionCard, Text } from '@/components/ui';
import { colors } from '@/theme';

export default function About() {
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen scroll background={colors.background} contentStyle={styles.content}>
      <ScreenHeader title="About Nudge" />

      <View style={styles.hero}>
        <Image
          source={require('@/assets/images/logo.png')}
          style={styles.logo}
          contentFit="contain"
          accessibilityLabel="Nudge"
        />
        <Text variant="bodyLarge" color={colors.textSecondary} align="center">
          Warm, well-timed reminders that help you build habits without the guilt.
        </Text>
        <Text variant="caption" color={colors.textMuted}>
          Version {version}
        </Text>
      </View>

      <SectionCard title="Legal">
        <ListRow
          title="Terms of Service"
          icon="document-text-outline"
          onPress={() => router.push('/legal/terms')}
        />
        <ListRow
          title="Privacy Policy"
          icon="shield-checkmark-outline"
          onPress={() => router.push('/legal/privacy')}
        />
      </SectionCard>

      <SectionCard title="Get in touch">
        <ListRow
          title="Send feedback"
          icon="chatbubbles-outline"
          onPress={() => router.push('/settings/feedback')}
        />
        <ListRow
          title="Help & FAQ"
          icon="help-circle-outline"
          onPress={() => router.push('/settings/help')}
        />
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, paddingTop: 8 },
  hero: { alignItems: 'center', gap: 10, paddingVertical: 12 },
  logo: { width: 150, height: 64 },
});
