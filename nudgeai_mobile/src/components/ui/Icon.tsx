import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { colors } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
};

export function Icon({ name, size = 22, color = colors.text }: IconProps) {
  return <Ionicons name={name} size={size} color={color} />;
}
