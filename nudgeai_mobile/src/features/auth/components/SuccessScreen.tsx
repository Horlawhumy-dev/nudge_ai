import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Text } from '@/components/ui';
import { colors } from '@/theme';

type SuccessScreenProps = {
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
};

/** Confetti + badge confirmation used for "verified", "password reset" and "ready". */
export function SuccessScreen({ title, message, actionLabel, onAction }: SuccessScreenProps) {
  return (
    <Screen edgeToEdge>
      <Image
        source={require('@/assets/images/confetti.png')}
        style={styles.confetti}
        contentFit="cover"
        contentPosition="top"
      />
      <View style={styles.body}>
        <Text variant="title" align="center" style={styles.title}>
          {title}
        </Text>
        <Text variant="bodyLarge" color={colors.textSecondary} align="center">
          {message}
        </Text>
        <Button label={actionLabel} onPress={onAction} style={styles.action} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  confetti: { width: '100%', aspectRatio: 1170 / 840, marginHorizontal: -20, alignSelf: 'center' },
  body: { marginTop: 4 },
  title: { marginBottom: 10 },
  action: { marginTop: 36 },
});
