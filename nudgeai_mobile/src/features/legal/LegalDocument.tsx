import { StyleSheet, View } from 'react-native';

import { Screen, ScreenHeader, Text } from '@/components/ui';
import { colors, radius } from '@/theme';

import type { LegalDoc } from './content';

/** Readable long-form text screen used for the Terms and the Privacy Policy. */
export function LegalDocument({ doc }: { doc: LegalDoc }) {
  return (
    <Screen scroll background={colors.background} contentStyle={styles.content}>
      <ScreenHeader title={doc.title} subtitle={`Last updated ${doc.updated}`} />
      <View style={styles.notice}>
        <Text variant="caption" color={colors.primaryPressed}>
          Draft text for the pre-release app. It will be reviewed before launch.
        </Text>
      </View>
      {doc.sections.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text variant="subheading">{section.heading}</Text>
          {section.body.map((paragraph) => (
            <Text key={paragraph} variant="bodyLarge" color={colors.textSecondary} style={styles.p}>
              {paragraph}
            </Text>
          ))}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20, paddingTop: 8 },
  notice: { padding: 12, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  section: { gap: 8 },
  p: { lineHeight: 24 },
});
