import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={() => undefined} accessibilityViewIsModal>
          <Text variant="heading" align="center" style={styles.title}>
            {title}
          </Text>
          {message ? (
            <Text variant="bodyLarge" color={colors.textSecondary} align="center">
              {message}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Button label={cancelLabel} variant="secondary" onPress={onCancel} style={styles.action} />
            <Button label={confirmLabel} onPress={onConfirm} style={styles.action} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.xl, padding: 24, gap: 12 },
  title: { marginBottom: 4 },
  actions: { flexDirection: 'row', gap: 14, marginTop: 14 },
  action: { flex: 1 },
});
