import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_HEIGHT } from './tabs';

/** Bottom padding that keeps content clear of the floating tab bar. */
export function useTabBarClearance(): number {
  const { bottom } = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + Math.max(bottom, 12) + 24;
}
