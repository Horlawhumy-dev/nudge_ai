import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

import { BackButton } from './BackButton';
import { Text } from './Text';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  /** Hide on root tab screens that have nothing to go back to. */
  showBack?: boolean;
  right?: ReactNode;
  onBack?: () => void;
};

export function ScreenHeader({ title, subtitle, showBack = true, right, onBack }: ScreenHeaderProps) {
  return (
    <View style={styles.row}>
      {showBack ? <BackButton onPress={onBack} /> : null}
      <View style={styles.titles}>
        <Text variant="title" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodyLarge" color={colors.textSecondary}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 8 },
  titles: { flex: 1 },
  title: { fontSize: 24 },
});
