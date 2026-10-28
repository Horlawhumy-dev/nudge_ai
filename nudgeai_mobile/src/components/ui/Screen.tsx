import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { usePullRefresh } from '@/hooks/usePullRefresh';
import { colors, gutter } from '@/theme';

type ScreenProps = {
  children: ReactNode;
  /** Pinned below the content, above the keyboard (CTA buttons). */
  footer?: ReactNode;
  /** Floating elements (FABs) drawn above the scroll area. */
  overlay?: ReactNode;
  scroll?: boolean;
  background?: string;
  /** Extra bottom space so content clears the floating tab bar. */
  bottomInset?: number;
  /** Drop the safe-area top padding (screens that draw their own full-bleed header). */
  edgeToEdge?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Enables pull-down-to-refresh on a scrolling screen. Resolve when the data is up to date. */
  onRefresh?: () => Promise<unknown>;
};

export function Screen({
  children,
  footer,
  overlay,
  scroll = false,
  background = colors.backgroundAuth,
  bottomInset = 0,
  edgeToEdge = false,
  contentStyle,
  onRefresh,
}: ScreenProps) {
  const pull = usePullRefresh(onRefresh);
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const padded = [
    styles.content,
    { paddingHorizontal: gutter, paddingBottom: bottomInset + (footer ? 0 : insets.bottom + 16) },
    contentStyle,
  ];

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: background, paddingTop: edgeToEdge ? 0 : insets.top + 8 },
      ]}
    >
      {/* 'padding' on both platforms: Android is edge-to-edge, so the window no longer resizes itself. */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={padded}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={pull.refreshing}
                  onRefresh={() => void pull.onRefresh()}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                />
              ) : undefined
            }
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, padded]}>{children}</View>
        )}
        {footer ? (
          <View
            style={[
              styles.footer,
              { paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom, 16) },
            ]}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
      {overlay}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1 },
  footer: { paddingHorizontal: gutter, paddingTop: 12 },
});
