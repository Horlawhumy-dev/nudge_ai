import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';

import { colors, radius } from '@/theme';

import { Text } from './Text';

type SectionCardProps = {
  title?: string;
  children: ReactNode;
  gap?: number;
};

/** White container grouping a titled list of rows (settings, profile menu). */
export function SectionCard({ title, children, gap = 10 }: SectionCardProps) {
  return (
    <View style={styles.card}>
      {title ? (
        <Text variant="subheading" color={colors.textSecondary} style={styles.title}>
          {title}
        </Text>
      ) : null}
      <View style={{ gap }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderSoft, padding: 16 },
  title: { marginBottom: 12, marginLeft: 4 },
});
