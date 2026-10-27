import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { colors, typography, type TextVariant } from '@/theme';

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  color?: string;
  align?: TextStyle['textAlign'];
};

export function Text({ variant = 'body', color = colors.text, align, style, ...rest }: TextProps) {
  return <RNText {...rest} style={[typography[variant], { color }, align && { textAlign: align }, style]} />;
}
