import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Screen, ScreenHeader, Text } from '@/components/ui';
import { DEMO_MODE } from '@/constants/env';
import { accountApi } from '@/services/api/endpoints/account';
import { toast } from '@/store/useToastStore';
import { PLANS, type Billing } from '@/features/settings/plans';
import { usePreferencesStore } from '@/store/usePreferencesStore';
import { colors, radius } from '@/theme';

function Feature({ label }: { label: string }) {
  return (
    <View style={styles.feature}>
      <Icon name="checkmark" size={20} />
      <Text variant="bodyLarge" color={colors.textSecondary}>
        {label}
      </Text>
    </View>
  );
}

export default function Subscription() {
  const plan = usePreferencesStore((s) => s.plan);
  const setPreferences = usePreferencesStore((s) => s.set);
  const [saving, setSaving] = useState(false);
  // Plan changes go through the server, which owns the limits (3 habits, 5 tasks a day on Free).
  const choose = async (next: 'free' | 'pro') => {
    if (DEMO_MODE) {
      setPreferences({ plan: next });
      return;
    }
    setSaving(true);
    try {
      const saved = await accountApi.changePlan(next, billing);
      setPreferences({ plan: saved.plan });
      toast.success(saved.plan === 'pro' ? 'Welcome to Pro! 🎉' : 'You’re on the Free plan.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Couldn’t change your plan. Try again.');
    } finally {
      setSaving(false);
    }
  };
  const [billing, setBilling] = useState<Billing>('monthly');
  const pro = PLANS.pro[billing];

  return (
    <Screen scroll background={colors.background} contentStyle={styles.content}>
      <ScreenHeader title="Choose a plan" />

      <View style={styles.toggle} accessibilityRole="tablist">
        {(['monthly', 'yearly'] as const).map((b) => {
          const on = billing === b;
          return (
            <Pressable
              key={b}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setBilling(b)}
              style={[styles.toggleItem, on && styles.toggleOn]}
            >
              <Text variant="subheading" color={on ? colors.white : colors.text}>
                {b === 'monthly' ? 'Monthly' : 'Yearly'}
              </Text>
              {b === 'yearly' ? (
                <Text variant="bodyLarge" color={on ? colors.white : colors.primary}>
                  {' '}
                  Saves 17%
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <Card padding={22} radiusSize="xl" style={styles.plan}>
        <Text variant="subheading">{PLANS.free.name}</Text>
        <Text variant="body" color={colors.textSecondary}>
          {PLANS.free.tagline}
        </Text>
        <Text variant="title" style={styles.price}>
          $0
        </Text>
        <Button
          label={plan === 'free' ? 'Current plan' : 'Switch to Free'}
          variant="outline"
          disabled={plan === 'free' || saving}
          onPress={() => void choose('free')}
        />
        <View style={styles.features}>
          {PLANS.free.features.map((f) => (
            <Feature key={f} label={f} />
          ))}
        </View>
      </Card>

      <View style={[styles.plan, styles.proCard]}>
        <Text variant="subheading">{PLANS.pro.name}</Text>
        <Text variant="body" color={colors.textSecondary}>
          {PLANS.pro.tagline}
        </Text>
        <Text variant="title" style={styles.price}>
          {pro.price}
          <Text variant="bodyLarge" color={colors.textSecondary}>
            {' '}
            {pro.period}
          </Text>
        </Text>
        <Button
          label={plan === 'pro' ? 'Current plan' : 'Get pro plan'}
          disabled={plan === 'pro' || saving}
          loading={saving}
          onPress={() => void choose('pro')}
          testID="get-pro"
        />
        <View style={styles.features}>
          {PLANS.pro.features.map((f) => (
            <Feature key={f} label={f} />
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, paddingTop: 8 },
  toggle: {
    flexDirection: 'row',
    padding: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  toggleItem: {
    flex: 1,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  toggleOn: { backgroundColor: colors.primary },
  plan: { gap: 6 },
  proCard: { backgroundColor: colors.primarySoft, borderRadius: radius.xl, padding: 22 },
  price: { marginVertical: 12 },
  features: { gap: 14, marginTop: 18 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 14 },
});
