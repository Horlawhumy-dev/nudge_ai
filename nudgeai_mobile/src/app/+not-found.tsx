import { useRouter } from 'expo-router';

import { EmptyState, Screen } from '@/components/ui';
import { colors } from '@/theme';

export default function NotFound() {
  const router = useRouter();
  return (
    <Screen background={colors.background} contentStyle={{ justifyContent: 'center' }}>
      <EmptyState
        icon="compass-outline"
        title="Page not found"
        message="That screen doesn’t exist or has moved."
        actionLabel="Back to Nudge"
        onAction={() => router.replace('/')}
      />
    </Screen>
  );
}
