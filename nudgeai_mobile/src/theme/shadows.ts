import type { ViewStyle } from 'react-native';

import { palette } from './palette';

export const shadows = {
  /** Soft purple glow under primary buttons and the FAB. */
  glow: {
    shadowColor: palette.purple,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 8,
  },
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
} satisfies Record<string, ViewStyle>;
