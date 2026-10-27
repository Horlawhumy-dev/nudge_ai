import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, gutter } from '@/theme';

type ScreenProps = {
  children: ReactNode;
  /** Pinned below the content, above the keyboard (CTA buttons). */
  footer?: ReactNode;
  scroll?: boolean;
  background?: string;
  /** Extra bottom space so content clears the floating tab bar. */
  bottomInset?: number;
  /** Drop the safe-area top padding (screens that draw their own full-bleed header). */
  edgeToEdge?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({
  children,
  footer,
  scroll = false,
  background = colors.backgroundAuth,
  bottomInset = 0,
  edgeToEdge = false,
  contentStyle,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const padded = [
    styles.content,
    { paddingHorizontal: gutter, paddingBottom: bottomInset + (footer ? 0 : insets.bottom + 16) },
    contentStyle,
  ];

  return (
    <View style={[styles.root, { backgroundColor: background, paddingTop: edgeToEdge ? 0 : insets.top + 8 }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={padded}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, padded]}>{children}</View>
        )}
        {footer ? (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>{footer}</View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1 },
  footer: { paddingHorizontal: gutter, paddingTop: 12 },
});
