import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { colors, radius } from '@/theme';

type CardProps = ViewProps & {
  padding?: number;
  radiusSize?: keyof typeof radius;
  style?: StyleProp<ViewStyle>;
};

export function Card({ padding = 16, radiusSize = 'lg', style, children, ...rest }: CardProps) {
  return (
    <View {...rest} style={[styles.card, { padding, borderRadius: radius[radiusSize] }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft },
});
