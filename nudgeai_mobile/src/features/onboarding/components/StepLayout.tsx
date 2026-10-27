import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackButton, Button, Screen, StepIndicator, Text } from '@/components/ui';
import { colors } from '@/theme';

import { ONBOARDING_STEPS } from '../data';

type StepLayoutProps = {
  step: number;
  title: string;
  subtitle: string;
  actionLabel?: string;
  canContinue: boolean;
  onContinue: () => void;
  children: ReactNode;
};

/** Shared chrome for the five setup questions: back, step bar, heading, pinned CTA. */
export function StepLayout({
  step,
  title,
  subtitle,
  actionLabel = 'Continue',
  canContinue,
  onContinue,
  children,
}: StepLayoutProps) {
  return (
    <Screen
      scroll
      footer={<Button label={actionLabel} onPress={onContinue} disabled={!canContinue} testID="step-continue" />}
    >
      <View style={styles.top}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/signup'))} />
        <StepIndicator step={step} total={ONBOARDING_STEPS} />
      </View>
      <View style={styles.heading}>
        <Text variant="title">{title}</Text>
        <Text variant="bodyLarge" color={colors.textSecondary} style={styles.subtitle}>
          {subtitle}
        </Text>
      </View>
      {children}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: 4 },
  heading: { marginTop: 36, marginBottom: 30 },
  subtitle: { marginTop: 8, maxWidth: 320 },
});
