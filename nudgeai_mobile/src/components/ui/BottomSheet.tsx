import { useEffect, type ReactNode } from 'react';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAnimatedValue } from '@/hooks/useAnimatedValue';
import { colors, gutter } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

type BottomSheetProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned under the scrolling form (primary action). */
  footer?: ReactNode;
};

const SCREEN_HEIGHT = Dimensions.get('window').height;

/** Modal bottom sheet. Content mounts when opened, so each open starts from a fresh slide-up. */
export function BottomSheet({ visible, onClose, ...content }: BottomSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SheetContent onClose={onClose} {...content} />
    </Modal>
  );
}

function SheetContent({ title, onClose, children, footer }: Omit<BottomSheetProps, 'visible'>) {
  const insets = useSafeAreaInsets();
  const progress = useAnimatedValue(0);

  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [progress]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT * 0.4, 0],
  });

  return (
    <View style={styles.backdrop}>
      <Pressable style={styles.dismiss} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView
        style={styles.host}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.sheet,
            { transform: [{ translateY }], maxHeight: SCREEN_HEIGHT - insets.top - 56 },
          ]}
        >
          <View style={styles.header}>
            <Text variant="subheading" style={styles.title}>
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close sheet"
              hitSlop={12}
              onPress={onClose}
            >
              <Icon name="close" size={26} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? (
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              {footer}
            </View>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  dismiss: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  host: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
    paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 18 },
  body: { paddingHorizontal: gutter, paddingTop: 20, paddingBottom: 20, gap: 20 },
  footer: { paddingHorizontal: gutter, paddingTop: 8 },
});
